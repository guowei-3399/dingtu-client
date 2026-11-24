// SPDX-License-Identifier: MIT
package cn.noyapi.dingtu.vpn

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import cn.noyapi.dingtu.core.RedactedLogger
import cn.noyapi.dingtu.core.VpnRoutingMode
import io.nekohasekai.libbox.BridgeOptions
import io.nekohasekai.libbox.BridgeSession
import io.nekohasekai.libbox.ConnectionOwner
import io.nekohasekai.libbox.InterfaceUpdateListener
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.LocalDNSTransport
import io.nekohasekai.libbox.NeighborUpdateListener
import io.nekohasekai.libbox.NetworkInterface
import io.nekohasekai.libbox.NetworkInterfaceIterator
import io.nekohasekai.libbox.Notification
import io.nekohasekai.libbox.PlatformInterface
import io.nekohasekai.libbox.PlatformUser
import io.nekohasekai.libbox.ShellSession
import io.nekohasekai.libbox.StringIterator
import io.nekohasekai.libbox.TunOptions
import io.nekohasekai.libbox.WIFIState
import java.net.Inet4Address
import java.net.Inet6Address

internal class StringArrayIterator(private val items: List<String>) : StringIterator {
    private var index = 0
    override fun hasNext(): Boolean = index < items.size
    override fun len(): Int = items.size
    override fun next(): String = items[index++]
}

internal class NetworkInterfaceArrayIterator(
    private val items: List<NetworkInterface>,
) : NetworkInterfaceIterator {
    private var index = 0
    override fun hasNext(): Boolean = index < items.size
    override fun next(): NetworkInterface = items[index++]
}

class DingtuPlatformInterface(
    private val vpnService: VpnService,
    private val onPhysicalNetworkChanged: (networkKey: String?) -> Unit,
) : PlatformInterface {

    private val connectivityManager: ConnectivityManager =
        vpnService.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val tunLock = Any()
    private val monitorLock = Any()

    @Volatile
    private var currentRoutingPlan: EffectiveVpnApplicationPlan? = null

    @Volatile
    private var activeTunDescriptor: ParcelFileDescriptor? = null

    @Volatile
    private var myTunInterfaceName: String = ""

    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    fun setActiveRoutingPlan(plan: EffectiveVpnApplicationPlan) {
        currentRoutingPlan = plan
    }

    fun hasOpenTun(): Boolean = activeTunDescriptor != null

    fun closeTunDescriptor() {
        synchronized(tunLock) {
            val existing = activeTunDescriptor
            activeTunDescriptor = null
            myTunInterfaceName = ""
            if (existing != null) {
                runCatching { existing.close() }
            }
        }
    }

    fun shutdownMonitor() {
        synchronized(monitorLock) {
            val cb = networkCallback
            networkCallback = null
            if (cb != null) {
                runCatching { connectivityManager.unregisterNetworkCallback(cb) }
            }
        }
    }

    override fun usePlatformAutoDetectInterfaceControl(): Boolean = true

    override fun autoDetectInterfaceControl(fd: Int) {
        if (fd < 0) {
            throw IllegalArgumentException("PROTECT_INVALID_FD")
        }
        val protectedOk = vpnService.protect(fd)
        if (!protectedOk) {
            throw IllegalStateException("PROTECT_FD_FAILED")
        }
    }

    override fun openTun(options: TunOptions): Int = synchronized(tunLock) {
        val plan = currentRoutingPlan
            ?: throw IllegalStateException("MISSING_ROUTING_PLAN")

        val builder = vpnService.Builder()
            .setSession("定途 Dingtu")
            .setMtu(if (options.mtu > 0) options.mtu else AndroidLibboxTunnelDefaults.DEFAULT_MTU)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.setMetered(false)
        }

        // Configure IPv4 & IPv6 TUN interface addresses
        val inet4Addr = options.inet4Address
        while (inet4Addr != null && inet4Addr.hasNext()) {
            val prefix = inet4Addr.next()
            builder.addAddress(prefix.address(), prefix.prefix())
        }
        val inet6Addr = options.inet6Address
        while (inet6Addr != null && inet6Addr.hasNext()) {
            val prefix = inet6Addr.next()
            builder.addAddress(prefix.address(), prefix.prefix())
        }

        // Configure DNS servers (hijacked inside libbox to encrypted remote DoH)
        var addedDns = false
        val dnsServers = runCatching { options.dnsServerAddress }.getOrNull()
        while (dnsServers != null && dnsServers.hasNext()) {
            val dnsAddr = dnsServers.next().trim()
            if (dnsAddr.isNotEmpty()) {
                builder.addDnsServer(dnsAddr)
                addedDns = true
            }
        }
        if (!addedDns) {
            builder.addDnsServer("1.1.1.1")
        }

        // Configure routes from libbox pre-computed route ranges
        if (options.autoRoute) {
            var addedV4Route = false
            val v4Ranges = options.inet4RouteRange
            while (v4Ranges != null && v4Ranges.hasNext()) {
                val route = v4Ranges.next()
                builder.addRoute(route.address(), route.prefix())
                addedV4Route = true
            }
            if (!addedV4Route) {
                builder.addRoute("0.0.0.0", 0)
            }

            val v6Ranges = options.inet6RouteRange
            while (v6Ranges != null && v6Ranges.hasNext()) {
                val route = v6Ranges.next()
                builder.addRoute(route.address(), route.prefix())
            }
        }

        // Enforce strictly 2-mode Android application routing (per_app_vpn or global_vpn)
        when (plan.mode) {
            VpnRoutingMode.PER_APP_VPN -> {
                var addedCount = 0
                for (pkg in plan.allowedPackages) {
                    if (pkg == vpnService.packageName) continue
                    runCatching {
                        builder.addAllowedApplication(pkg)
                        addedCount++
                    }.onFailure { err ->
                        RedactedLogger.warn("Skipped uninstalled allowed package $pkg: ${err.message}")
                    }
                }
                if (addedCount == 0) {
                    throw IllegalStateException("PER_APP_VPN_EMPTY_ALLOWLIST")
                }
            }
            VpnRoutingMode.GLOBAL_VPN -> {
                for (disallowedPkg in plan.disallowedPackages) {
                    builder.addDisallowedApplication(disallowedPkg)
                }
            }
        }

        val establishedPfd = builder.establish()
            ?: throw IllegalStateException("VPN_ESTABLISH_FAILED")

        val previousPfd = activeTunDescriptor
        activeTunDescriptor = establishedPfd
        if (previousPfd != null) {
            runCatching { previousPfd.close() }
        }

        // libbox calls dup(tunFd) internally; DingtuPlatformInterface retains & closes ParcelFileDescriptor.
        establishedPfd.fd
    }

    override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener) {
        synchronized(monitorLock) {
            shutdownMonitor()
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
                .build()

            val callback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    publishUnderlyingInterface(network, listener)
                }

                override fun onCapabilitiesChanged(
                    network: Network,
                    networkCapabilities: NetworkCapabilities,
                ) {
                    publishUnderlyingInterface(network, listener, networkCapabilities)
                }

                override fun onLinkPropertiesChanged(
                    network: Network,
                    linkProperties: LinkProperties,
                ) {
                    publishUnderlyingInterface(network, listener, linkPropsOverride = linkProperties)
                }

                override fun onLost(network: Network) {
                    listener.updateDefaultInterface("", -1, false, false)
                    onPhysicalNetworkChanged(null)
                }
            }
            connectivityManager.registerNetworkCallback(request, callback)
            networkCallback = callback
        }
    }

    override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener?) {
        shutdownMonitor()
    }

    private fun publishUnderlyingInterface(
        network: Network,
        listener: InterfaceUpdateListener,
        capsOverride: NetworkCapabilities? = null,
        linkPropsOverride: LinkProperties? = null,
    ) {
        val caps = capsOverride ?: connectivityManager.getNetworkCapabilities(network) ?: return
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)) return

        val linkProps = linkPropsOverride ?: connectivityManager.getLinkProperties(network) ?: return
        val ifName = linkProps.interfaceName ?: return
        if (ifName.isBlank() || ifName == myTunInterfaceName || ifName.startsWith("tun")) {
            return
        }

        val netIf = runCatching { java.net.NetworkInterface.getByName(ifName) }.getOrNull()
        val ifIndex = netIf?.index ?: return
        val isExpensive = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        val isConstrained = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
            !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_RESTRICTED)

        listener.updateDefaultInterface(ifName, ifIndex, isExpensive, isConstrained)
        onPhysicalNetworkChanged("${network.networkHandle}:$ifName")
    }

    @Suppress("DEPRECATION")
    override fun getInterfaces(): NetworkInterfaceIterator {
        val results = mutableListOf<NetworkInterface>()
        for (network in connectivityManager.allNetworks) {
            val caps = connectivityManager.getNetworkCapabilities(network) ?: continue
            if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)) continue
            val linkProps = connectivityManager.getLinkProperties(network) ?: continue
            val ifName = linkProps.interfaceName ?: continue
            if (ifName.isBlank() || ifName == myTunInterfaceName || ifName.startsWith("tun")) continue

            val javaIf = runCatching { java.net.NetworkInterface.getByName(ifName) }.getOrNull() ?: continue
            val cidrs = linkProps.linkAddresses.mapNotNull { la ->
                val host = la.address?.hostAddress?.substringBefore('%') ?: return@mapNotNull null
                val maxBits = when (la.address) {
                    is Inet4Address -> 32
                    is Inet6Address -> 128
                    else -> return@mapNotNull null
                }
                val prefixLen = la.prefixLength.coerceIn(0, maxBits)
                "$host/$prefixLen"
            }
            val dnsList = linkProps.dnsServers.mapNotNull { it.hostAddress?.substringBefore('%') }
            val gateways = linkProps.routes
                .mapNotNull { it.gateway?.hostAddress?.substringBefore('%') }
                .distinct()

            val boxInterface = NetworkInterface().apply {
                index = javaIf.index
                mtu = runCatching { javaIf.mtu }.getOrDefault(1500).let { if (it > 0) it else 1500 }
                name = ifName
                addresses = StringArrayIterator(cidrs)
                flags = computeInterfaceFlags(javaIf)
                type = when {
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> Libbox.InterfaceTypeWIFI
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> Libbox.InterfaceTypeCellular
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> Libbox.InterfaceTypeEthernet
                    else -> Libbox.InterfaceTypeOther
                }
                dnsServer = StringArrayIterator(dnsList)
                gateway = StringArrayIterator(gateways)
                metered = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
            }
            results.add(boxInterface)
        }
        return NetworkInterfaceArrayIterator(results)
    }

    private fun computeInterfaceFlags(javaIf: java.net.NetworkInterface): Int {
        var flags = 0
        if (runCatching { javaIf.isUp }.getOrDefault(false)) flags = flags or 0x1 // IFF_UP
        if (runCatching { javaIf.isLoopback }.getOrDefault(false)) flags = flags or 0x8 // IFF_LOOPBACK
        if (runCatching { javaIf.isPointToPoint }.getOrDefault(false)) flags = flags or 0x10 // IFF_POINTOPOINT
        if (runCatching { javaIf.supportsMulticast() }.getOrDefault(false)) flags = flags or 0x1000 // IFF_MULTICAST
        return flags
    }

    override fun registerMyInterface(name: String?) {
        myTunInterfaceName = name.orEmpty()
    }

    override fun useProcFS(): Boolean = false

    override fun underNetworkExtension(): Boolean = false

    override fun includeAllNetworks(): Boolean = false

    override fun localDNSTransport(): LocalDNSTransport? = null

    override fun clearDNSCache() = Unit

    override fun readWIFIState(): WIFIState? = null

    override fun sendNotification(notification: Notification?) = Unit

    override fun cancelNotification(identifier: String?, typeID: Int) = Unit

    override fun startNeighborMonitor(listener: NeighborUpdateListener?) = Unit

    override fun closeNeighborMonitor(listener: NeighborUpdateListener?) = Unit

    override fun findConnectionOwner(
        ipProtocol: Int,
        sourceAddress: String?,
        sourcePort: Int,
        destinationAddress: String?,
        destinationPort: Int,
    ): ConnectionOwner = throw UnsupportedOperationException("Per-app routing enforced at VpnService kernel layer")

    override fun usePlatformShell(): Boolean = false

    override fun checkPlatformShell() = throw UnsupportedOperationException("Platform shell disabled")

    override fun openShellSession(
        user: PlatformUser?,
        command: String?,
        environ: StringIterator?,
        term: String?,
        rows: Int,
        cols: Int,
    ): ShellSession = throw UnsupportedOperationException("Platform shell disabled")

    override fun lookupUser(username: String?): PlatformUser =
        throw UnsupportedOperationException("Platform shell disabled")

    override fun lookupSFTPServer(): String =
        throw UnsupportedOperationException("SFTP disabled")

    override fun readSystemSSHHostKey(): String =
        throw UnsupportedOperationException("SSH disabled")

    override fun tailscaleHostname(): String = ""

    override fun usePlatformBridge(): Boolean = false

    override fun createBridge(options: BridgeOptions?): BridgeSession =
        throw UnsupportedOperationException("Bridge disabled")
}

private object AndroidLibboxTunnelDefaults {
    const val DEFAULT_MTU = 1500
}
