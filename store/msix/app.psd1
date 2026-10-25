@{
    # Read by New-StorePackage.ps1, New-StoreImages.ps1 and Test-StorePackage.ps1.
    AppId = 'LeanMark'
    Executable = 'LeanMark.exe'
    # The command alias; the ZIP installer registers the same name under App Paths.
    Alias = 'leanmark.exe'
    IconSvg = 'brand\leanmark-mark.svg'
    # The extensions installer\install.ps1 registers.
    Extensions = @('.md', '.markdown', '.mdown', '.mkd')
    RequiredFiles = @(
        'WebView2Loader.dll',
        'assets\reader.html',
        'assets\reader.css',
        'assets\reader.js',
        'assets\vendor\mermaid.min.js'
    )
    # ZIP-only files. In the MSIX, Windows installs, associates and uninstalls.
    ExcludeFromPackage = @('installer', 'INSTALL.txt')
    ReleaseAssetPattern = 'LeanMark-v{0}-windows-x64.zip'
    SampleFile = 'docs\images\screenshot-source\service-notes.md'
    # Used until the repository variables hold the Partner Center values.
    PlaceholderIdentityName = 'Placeholder.LeanMark'
    PlaceholderPublisher = 'CN=PLACEHOLDER-SET-MSIX_PUBLISHER'
    DefaultPublisherDisplayName = 'Lean Apps Studio'
}
