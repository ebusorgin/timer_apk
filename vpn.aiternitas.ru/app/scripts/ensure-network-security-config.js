// Ensures network_security_config.xml exists in react-native-wireguard-vpn (required by Android)
const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, '../node_modules/react-native-wireguard-vpn/android/src/main/res/xml');
const targetFile = path.join(targetDir, 'network_security_config.xml');
const content = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

if (!fs.existsSync(path.join(__dirname, '../node_modules/react-native-wireguard-vpn'))) {
  process.exit(0);
}
fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(targetFile, content, 'utf8');
console.log('Created network_security_config.xml for react-native-wireguard-vpn');
