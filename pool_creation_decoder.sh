#!/bin/bash

# Pool Creation Transaction Decoder & Monitor
# Server: 185.191.117.142 
# For the transaction: 0xd080b1d1319d7356d9a509ff3d9be84be7fddd396bdbc1c8331184a2c83ea92d

echo "🎯 POOL CREATION TRANSACTION DECODER"
echo "===================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Function to convert hex to decimal
hex_to_dec() {
    echo $((16#${1#0x}))
}

# Function to convert hex timestamp to human readable
hex_to_date() {
    local hex_time=$1
    local dec_time=$(hex_to_dec $hex_time)
    date -d "@$dec_time" "+%Y-%m-%d %H:%M:%S UTC"
}

# Function to decode token amounts (18 decimals)
decode_token_amount() {
    local hex_amount=$1
    local dec_amount=$(hex_to_dec $hex_amount)
    # Convert from wei to human readable (18 decimals)
    python3 -c "print(f'{$dec_amount / 10**18:.6f}')" 2>/dev/null || echo "$(($dec_amount / 1000000000000000000))"
}

echo -e "${BLUE}📊 ANALYZING POOL CREATION TRANSACTION${NC}"
echo "Transaction: 0xd080b1d1319d7356d9a509ff3d9be84be7fddd396bdbc1c8331184a2c83ea92d"
echo

# Get transaction details
TX_HASH="0xd080b1d1319d7356d9a509ff3d9be84be7fddd396bdbc1c8331184a2c83ea92d"

echo -e "${YELLOW}🏭 POOL CREATION EVENT:${NC}"
echo "Factory: 0x33128a8fc17869897dce68ed026d694621f6fdfd (Uniswap V3)"
echo "Token0: 0x4200000000000000000000000000000000000006 (WETH)"
echo "Token1: 0xf680693647d16b383445881e2f1afcb5634355f2 (Peplo Escobar)"
echo "Fee: 10000 (1.00%)"
echo "Tick Spacing: 200"
echo "Pool Address: 0x83d93cab1d4c6f286d69794f02ace28fad8e383b"
echo

echo -e "${GREEN}💰 INITIAL LIQUIDITY ADDED:${NC}"
echo "Block: 33751985 (0x202fbb1)"
echo "Timestamp: $(hex_to_date 0x68905445)"
echo

# Decode the amounts from the logs
echo -e "${CYAN}📈 LIQUIDITY POSITION DETAILS:${NC}"
echo "Peplo Tokens Deposited: $(decode_token_amount 0x1431e0fae6d7217ca9ffdc0b6) PEPLO"
echo "Position NFT ID: $(hex_to_dec 0x381a92)"
echo "Tick Lower: $(hex_to_dec 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff2766)"
echo "Tick Upper: $(hex_to_dec 0x3b9e8)"
echo "Liquidity: $(hex_to_dec 0x30fd87afd77c35694353a99bb3d56)"
echo

echo -e "${RED}⛽ TRANSACTION COSTS:${NC}"
echo "Gas Used: $(hex_to_dec 0x4e1447) gas"
echo "Gas Price: $(hex_to_dec 0x167d08) wei (23.6 Gwei)"
echo "L1 Fee: \$$(python3 -c "print(f'{$(hex_to_dec 0x660ba877) / 10**18 * 3000:.2f}')" 2>/dev/null || echo "~0.60")"
echo

echo -e "${BLUE}🔍 MONITOR NEW POOLS (Real-time):${NC}"
echo "Command to monitor live:"
echo "curl -s -X POST -H 'Content-Type: application/json' \\"
echo "  -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_getLogs\",\"params\":[{\"fromBlock\":\"latest\",\"topics\":[\"0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118\"]}],\"id\":1}' \\"
echo "  http://localhost:8545"
echo

# Function to monitor new pools
monitor_new_pools() {
    echo -e "${YELLOW}🔄 Starting real-time pool monitoring...${NC}"
    echo "Checking every 10 seconds for new pools..."
    echo "Press Ctrl+C to stop"
    echo
    
    local last_block=""
    
    while true; do
        # Get latest block
        local current_block=$(curl -s -X POST -H "Content-Type: application/json" \
            -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
            http://localhost:8545 | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
        
        if [[ "$current_block" != "$last_block" && -n "$current_block" ]]; then
            echo -e "${CYAN}📦 New Block: $current_block$(NC)"
            
            # Check for pool creation events in this block
            local pools=$(curl -s -X POST -H "Content-Type: application/json" \
                -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getLogs\",\"params\":[{\"fromBlock\":\"$current_block\",\"toBlock\":\"$current_block\",\"topics\":[\"0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118\"]}],\"id\":1}" \
                http://localhost:8545)
            
            if echo "$pools" | grep -q '"address"'; then
                echo -e "${GREEN}🎉 NEW POOL CREATED!${NC}"
                echo "$pools" | head -200
                echo
            fi
            
            last_block="$current_block"
        fi
        
        sleep 10
    done
}

# Main execution
if [[ "$1" == "monitor" ]]; then
    monitor_new_pools
elif [[ "$1" == "decode" && -n "$2" ]]; then
    echo "Decoding transaction: $2"
    curl -s -X POST -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionReceipt\",\"params\":[\"$2\"],\"id\":1}" \
        http://localhost:8545 | head -500
else
    echo -e "${YELLOW}Usage:${NC}"
    echo "  $0               # Show analysis of the example transaction"
    echo "  $0 monitor       # Start real-time monitoring for new pools"
    echo "  $0 decode <hash> # Decode a specific transaction"
fi 