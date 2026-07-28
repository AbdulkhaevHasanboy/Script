#!/usr/bin/env bash
set -e

echo "======================================================================"
echo "🚀 Setting up Coursera Automation Stack on Google Colab"
echo "======================================================================"

# 1. Update and install Tor, Xvfb, Node.js, and dependencies
echo "📦 Installing Tor, Xvfb, and system libraries..."
sudo apt-get update -qq
sudo apt-get install -y -qq tor xvfb libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2

# 2. Configure Tor for ControlPort (9051) authentication
echo "🧅 Configuring Tor service..."
sudo bash -c 'cat << EOF > /etc/tor/torrc
SocksPort 9050
ControlPort 9051
CookieAuthentication 0
EOF'

# 3. Restart Tor service
echo "🔄 Starting Tor background service..."
sudo service tor restart
sleep 3

# 4. Install Node.js dependencies
echo "📦 Installing Node.js packages (playwright-extra, stealth plugin)..."
npm install playwright playwright-extra puppeteer-extra-plugin-stealth

# 5. Install Playwright Chromium binaries
echo "🌐 Installing Chromium browser binaries..."
npx playwright install chromium

echo "======================================================================"
echo "✅ Setup Complete! Run the automation via Xvfb:"
echo "   xvfb-run -a -s '-screen 0 1920x1080x24' node signup_coursera_manual.js"
echo "======================================================================"
