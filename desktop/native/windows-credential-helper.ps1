$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

# This helper accepts one request through its private stdin pipe. It never
# accepts credentials as arguments, reads other targets, or opens a listener.
# Reads are encrypted for the invoking process before anything reaches stdout.
$nativeCode = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

public static class NoyaCredentialHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Credential {
        public uint Flags, Type;
        public string TargetName, Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist, AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias, UserName;
    }
    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CredWrite(ref Credential credential, uint flags);
    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
    [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CredDelete(string target, uint type, uint flags);
    [DllImport("advapi32.dll")]
    private static extern void CredFree(IntPtr credential);

    public static void Write(string target, byte[] value) {
        if (value.Length < 1 || value.Length > 2560) throw new ArgumentException("size");
        IntPtr blob = Marshal.AllocHGlobal(value.Length);
        try {
            Marshal.Copy(value, 0, blob, value.Length);
            Credential credential = new Credential { Type = 1, TargetName = target,
                Comment = "Noya local enterprise credential", CredentialBlobSize = (uint)value.Length,
                CredentialBlob = blob, Persist = 2, UserName = "Noya" };
            if (!CredWrite(ref credential, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
        } finally {
            Marshal.Copy(new byte[value.Length], 0, blob, value.Length);
            Marshal.FreeHGlobal(blob);
        }
    }
    public static byte[] Read(string target) {
        IntPtr pointer;
        if (!CredRead(target, 1, 0, out pointer)) {
            int error = Marshal.GetLastWin32Error();
            if (error == 1168) return null;
            throw new Win32Exception(error);
        }
        try {
            Credential credential = (Credential)Marshal.PtrToStructure(pointer, typeof(Credential));
            if (credential.CredentialBlobSize < 1 || credential.CredentialBlobSize > 2560) throw new ArgumentException("size");
            byte[] value = new byte[credential.CredentialBlobSize];
            Marshal.Copy(credential.CredentialBlob, value, 0, value.Length);
            Marshal.Copy(new byte[value.Length], 0, credential.CredentialBlob, value.Length);
            return value;
        } finally { CredFree(pointer); }
    }
    public static bool Delete(string target) {
        if (CredDelete(target, 1, 0)) return true;
        int error = Marshal.GetLastWin32Error();
        if (error == 1168) return false;
        throw new Win32Exception(error);
    }
    public static string[] Seal(byte[] value, byte[] encryptionKey, byte[] authenticationKey, string nonce) {
        using (Aes aes = Aes.Create()) {
            aes.KeySize = 256; aes.Mode = CipherMode.CBC; aes.Padding = PaddingMode.PKCS7;
            aes.Key = encryptionKey; aes.GenerateIV();
            byte[] ciphertext;
            using (ICryptoTransform transform = aes.CreateEncryptor()) {
                ciphertext = transform.TransformFinalBlock(value, 0, value.Length);
            }
            byte[] prefix = Encoding.UTF8.GetBytes("Noya.SecretStore/v1\0" + nonce + "\0");
            byte[] signed = new byte[prefix.Length + aes.IV.Length + ciphertext.Length];
            Buffer.BlockCopy(prefix, 0, signed, 0, prefix.Length);
            Buffer.BlockCopy(aes.IV, 0, signed, prefix.Length, aes.IV.Length);
            Buffer.BlockCopy(ciphertext, 0, signed, prefix.Length + aes.IV.Length, ciphertext.Length);
            using (HMACSHA256 hmac = new HMACSHA256(authenticationKey)) {
                return new string[] { Convert.ToBase64String(aes.IV), Convert.ToBase64String(ciphertext), Convert.ToBase64String(hmac.ComputeHash(signed)) };
            }
        }
    }
}
'@

$value = $null
$encryptionKey = $null
$authenticationKey = $null
$request = $null
$text = $null
$stage = 'request'
try {
    $text = [Console]::In.ReadToEnd()
    if ($text.Length -gt 16384) { throw 'request' }
    $request = $text | ConvertFrom-Json
    if ($request.version -ne 1 -or $request.operation -notin @('get','set','remove')) { throw 'request' }
    if ($request.target -notmatch '^Noya/Assistant/v1/[a-f0-9]{64}/[a-z][a-z0-9._-]{0,63}/[a-f0-9]{64}$') { throw 'target' }
    if ($request.nonce -notmatch '^[a-f0-9]{32}$') { throw 'nonce' }
    $encryptionKey = [Convert]::FromBase64String($request.encryptionKey)
    $authenticationKey = [Convert]::FromBase64String($request.authenticationKey)
    if ($encryptionKey.Length -ne 32 -or $authenticationKey.Length -ne 32) { throw 'key' }
    $stage = 'compile'
    Add-Type -TypeDefinition $nativeCode -Language CSharp -ErrorAction Stop
    $response = @{ version = 1; ok = $true; nonce = $request.nonce }
    switch ($request.operation) {
        'set' {
            $stage = 'write'
            $value = [Convert]::FromBase64String($request.value)
            [NoyaCredentialHelper]::Write($request.target, $value)
        }
        'get' {
            $stage = 'read'
            $value = [NoyaCredentialHelper]::Read($request.target)
            $response.found = $null -ne $value
            if ($response.found) {
                $sealed = [NoyaCredentialHelper]::Seal($value, $encryptionKey, $authenticationKey, $request.nonce)
                $response.iv = $sealed[0]; $response.ciphertext = $sealed[1]; $response.tag = $sealed[2]
            }
        }
        'remove' { $stage = 'delete'; $response.removed = [NoyaCredentialHelper]::Delete($request.target) }
    }
    [Console]::Out.Write(($response | ConvertTo-Json -Compress))
} catch {
    # Do not serialize exception details: external errors can contain input data.
    $failure = @{ version = 1; ok = $false; code = 'SECURE_STORE_OPERATION_FAILED'; stage = $stage }
    $cause = $_.Exception
    while ($null -ne $cause -and $cause -isnot [System.ComponentModel.Win32Exception]) { $cause = $cause.InnerException }
    if ($null -ne $cause) { $failure.nativeCode = $cause.NativeErrorCode }
    [Console]::Out.Write(($failure | ConvertTo-Json -Compress))
    exit 1
} finally {
    foreach ($bytes in @($value, $encryptionKey, $authenticationKey)) {
        if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    }
    $request = $null; $text = $null
}
