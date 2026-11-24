# SPDX-License-Identifier: MIT
param(
    [string]$SingBoxSourceDir = $env:SINGBOX_SRC_DIR,
    [string]$SdkRoot = $env:ANDROID_HOME,
    [string]$NdkVersion = "28.0.13004108",
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$ScratchRoot = (Join-Path $env:TEMP "dingtu-android-cache")
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SingBoxSourceDir)) {
    throw "Set SINGBOX_SRC_DIR or pass -SingBoxSourceDir pointing to sing-box v1.14.2 source"
}
if ([string]::IsNullOrWhiteSpace($SdkRoot)) {
    throw "Set ANDROID_HOME or pass -SdkRoot pointing to the Android SDK directory"
}
if ([string]::IsNullOrWhiteSpace($JavaHome)) {
    throw "Set JAVA_HOME or pass -JavaHome pointing to JDK 17+"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$libsDir = Join-Path $repoRoot "app\libs"
$outputAar = Join-Path $libsDir "libbox.aar"
$shaFile = Join-Path $libsDir "libbox.aar.sha256"
$ndkHome = Join-Path $SdkRoot "ndk\$NdkVersion"
$llvmBin = Join-Path $ndkHome "toolchains\llvm\prebuilt\windows-x86_64\bin"
$goBin = Join-Path (go env GOPATH) "bin"
$gomobileExe = Join-Path $goBin "gomobile.exe"

if (-not (Test-Path $SingBoxSourceDir)) {
    throw "sing-box v1.14.2 source not found at: $SingBoxSourceDir"
}
if (-not (Test-Path (Join-Path $ndkHome "source.properties"))) {
    throw "Android NDK $NdkVersion not found at: $ndkHome"
}
if (-not (Test-Path $gomobileExe)) {
    throw "gomobile.exe not found at: $gomobileExe (install github.com/sagernet/gomobile/cmd/gomobile@v0.1.12)"
}

$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:ANDROID_SDK_HOME = $SdkRoot
$env:ANDROID_NDK_HOME = $ndkHome
$env:NDK = $ndkHome
$env:CGO_ENABLED = "1"
$env:HTTP_PROXY = ""
$env:HTTPS_PROXY = ""
$env:ALL_PROXY = ""
$env:NO_PROXY = "*"
$env:PATH = "$JavaHome\bin;$goBin;$llvmBin;$env:PATH"

$scratchTemp = Join-Path $ScratchRoot "temp"
$scratchGoCache = Join-Path $ScratchRoot "gocache"
New-Item -ItemType Directory -Force -Path $scratchTemp, $scratchGoCache | Out-Null

$env:TEMP = $scratchTemp
$env:TMP = $scratchTemp
$env:GOTMPDIR = $scratchTemp
$env:GOCACHE = $scratchGoCache

$workRoot = Join-Path $scratchTemp "dingtu-libbox-build-1.14.2"
if (Test-Path $workRoot) {
    Remove-Item -Recurse -Force $workRoot
}
New-Item -ItemType Directory -Force -Path $workRoot | Out-Null

Write-Output "[1/3] Staging clean sing-box@v1.14.2 source to $workRoot ..."
Copy-Item -Path (Join-Path $SingBoxSourceDir "*") -Destination $workRoot -Recurse -Force
Get-ChildItem -Path $workRoot -Recurse -Force | ForEach-Object {
    if ($_.Attributes -band [System.IO.FileAttributes]::ReadOnly) {
        $_.Attributes = $_.Attributes -bxor [System.IO.FileAttributes]::ReadOnly
    }
}

New-Item -ItemType Directory -Force -Path $libsDir | Out-Null

$buildTags = "with_gvisor,with_quic,with_wireguard,with_utls,with_clash_api,with_low_memory,badlinkname,tfogo_checklinkname0"
$ldFlags = "-X github.com/sagernet/sing-box/constant.Version=1.14.2 -X runtime.godebugDefault=multipathtcp=0,tlssha1=1 -checklinkname=0 -s -w -buildid="

Write-Output "[2/3] Running gomobile bind for android/arm64,android/amd64 (API 26) ..."
Push-Location $workRoot
try {
    $gomobileArgs = @(
        "bind",
        "-v",
        "-o", $outputAar,
        "-target", "android/arm64,android/amd64",
        "-androidapi", "26",
        "-javapkg", "io.nekohasekai",
        "-libname", "box",
        "-trimpath",
        "-buildvcs=false",
        "-ldflags", $ldFlags,
        "-tags", $buildTags,
        "./experimental/libbox"
    )
    & $gomobileExe @gomobileArgs
    if ($LASTEXITCODE -ne 0) {
        throw "gomobile bind failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
    Remove-Item -Recurse -Force $workRoot -ErrorAction SilentlyContinue
}

Write-Output "[3/3] Verifying dual-ABI contents and recording SHA-256 ..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($outputAar)
try {
    $entries = $zip.Entries | Select-Object -ExpandProperty FullName
} finally {
    $zip.Dispose()
}

foreach ($requiredEntry in @("classes.jar", "jni/arm64-v8a/libbox.so", "jni/x86_64/libbox.so")) {
    if ($entries -notcontains $requiredEntry) {
        throw "libbox.aar missing required entry: $requiredEntry (found: $($entries -join ', '))"
    }
}

$hash = (Get-FileHash -Algorithm SHA256 $outputAar).Hash.ToLower()
"$hash  libbox.aar" | Set-Content -Encoding ascii -NoNewline $shaFile
Add-Content -Encoding ascii $shaFile ""
$sizeBytes = (Get-Item $outputAar).Length

Write-Output "LIBBOX_AAR_READY: $outputAar"
Write-Output "LIBBOX_AAR_BYTES: $sizeBytes"
Write-Output "LIBBOX_AAR_SHA256: $hash"
