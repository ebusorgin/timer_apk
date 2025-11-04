# Скрипт для выполнения на сервере через PowerShell
# Использование в PowerShell: 
# $password = ConvertTo-SecureString "carFds43" -AsPlainText -Force
# $credential = New-Object System.Management.Automation.PSCredential("root", $password)
# ssh root@82.146.44.126 "bash -s" < server-setup.sh

$server = "82.146.44.126"
$user = "root"
$password = "carFds43"

Write-Host "🚀 Подключение к серверу и выполнение настройки..." -ForegroundColor Green

# Создаем временный файл со скриптом
$scriptContent = Get-Content -Path "server-setup.sh" -Raw

# Подключаемся и выполняем скрипт
$command = @"
cd /opt
if [ ! -d "voice-room" ]; then
  mkdir -p voice-room
fi
cd voice-room
bash -s << 'SCRIPT'
$scriptContent
SCRIPT
"@

try {
    $session = New-SSHSession -ComputerName $server -Credential (New-Object System.Management.Automation.PSCredential($user, (ConvertTo-SecureString $password -AsPlainText -Force))) -ErrorAction Stop
    Invoke-SSHCommand -SessionId $session.SessionId -Command $command
    Remove-SSHSession -SessionId $session.SessionId
} catch {
    Write-Host "Используем стандартный SSH..." -ForegroundColor Yellow
    # Альтернативный способ через ssh команду
    echo $scriptContent | ssh -o StrictHostKeyChecking=no root@$server "bash -s"
}

Write-Host "✅ Настройка завершена!" -ForegroundColor Green

