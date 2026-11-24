# `libbox.aar` 构建与溯源说明（M0 锁定基线）

- **上游内核版本**：`github.com/sagernet/sing-box@v1.14.2`（MIT License）
- **绑定工具版本**：`github.com/sagernet/gomobile@v0.1.12`（`gomobile` + `gobind`）
- **Go 编译器**：`go1.27.3 windows/amd64`
- **Android NDK**：`28.0.13004108`（与 `sing-box@v1.14.2/cmd/internal/build_shared/sdk.go` 锁定版本一致）
- **目标架构（双 ABI）**：`android/arm64`（`jni/arm64-v8a/libbox.so`）+ `android/amd64`（`jni/x86_64/libbox.so`）
- **最低 Android API**：`26`（对应工程 `minSdk = 26`）
- **Java 包名与库名**：`-javapkg io.nekohasekai -libname box`
- **构建 Tags**：`with_gvisor,with_quic,with_wireguard,with_utls,with_clash_api,with_low_memory,badlinkname,tfogo_checklinkname0`
- **产物字节数**：`42401428` bytes
- **产物 SHA-256**：`62908b70fbcab5e97aa86fcdecf689b838e63a8c6b71263cbb880f7fdd86d1ab`
- **可复现构建脚本**：[`../../scripts/build-libbox.ps1`](../../scripts/build-libbox.ps1)
- **校验摘要清单**：[`libbox.aar.sha256`](libbox.aar.sha256)
