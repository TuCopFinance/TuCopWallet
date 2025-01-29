#!/usr/bin/env bash
# Turn off strict error checking temporarily while sourcing profile
set +euo pipefail

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm

# Source the user's shell configuration to get the correct PATH
if [ -f "$HOME/.zshrc" ]; then
    source "$HOME/.zshrc" 2>/dev/null || true
elif [ -f "$HOME/.bash_profile" ]; then
    source "$HOME/.bash_profile" 2>/dev/null || true
elif [ -f "$HOME/.bashrc" ]; then
    source "$HOME/.bashrc" 2>/dev/null || true
fi

# Turn strict error checking back on
set -euo pipefail

# Set terminal title
echo -en "\\033]0;Metro\\a"
clear

# Obtener el directorio raíz del proyecto
mobile_root="$(dirname "$(dirname "$0")")"
if [ ! -d "$mobile_root" ]; then
    echo "Error: No se puede encontrar el directorio del proyecto"
    exit 1
fi

# Cambiar al directorio del proyecto
cd "$mobile_root"

echo "Starting Metro bundler in $mobile_root..."

# Verificar que el package.json existe
if [ ! -f "package.json" ]; then
    echo "Error: No se encuentra package.json en $mobile_root"
    exit 1
fi

# Try to use node directly if available
if command -v node &> /dev/null; then
    NODE_BIN=$(command -v node)
    echo "Using Node from: $NODE_BIN"
    
    # Try to find yarn in common locations
    if [ -f "$HOME/.yarn/bin/yarn" ]; then
        YARN_BIN="$HOME/.yarn/bin/yarn"
    elif [ -f "/opt/homebrew/bin/yarn" ]; then
        YARN_BIN="/opt/homebrew/bin/yarn"
    elif [ -f "/usr/local/bin/yarn" ]; then
        YARN_BIN="/usr/local/bin/yarn"
    elif command -v yarn &> /dev/null; then
        YARN_BIN=$(command -v yarn)
    else
        echo "Error: No se puede encontrar yarn"
        exit 1
    fi
    
    echo "Using Yarn from: $YARN_BIN"
    "$YARN_BIN" react-native start || {
        echo "Error: Falló al iniciar Metro bundler"
        exit 1
    }
else
    echo "Error: Node.js no está instalado o no está en el PATH"
    exit 1
fi

if [[ -z "${CI+xxx}" ]]; then
    echo "Process terminated. Press <enter> to close the window"
    read -r
fi


