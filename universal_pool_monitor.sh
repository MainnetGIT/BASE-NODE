#!/bin/bash

# Universal Liquidity Pool Monitor
# Monitors for NEW pools by event signatures, not token addresses
# Server: 185.191.117.142

echo "🔍 UNIVERSAL LIQUIDITY POOL MONITOR"
echo "==================================="
echo "Monitoring ALL new pools regardless of tokens"
echo

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# KEY EVENT SIGNATURES FOR POOL DETECTION
declare -A EVENT_SIGNATURES=(
    ["0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118"]="PoolCreated(address,address,uint24,int24,address)"
    ["0x98636036cb66a9c19a37435efc1e90142190214e8abeb821bdba3f2990dd4c95"]="Initialize(uint160,int24)"
    ["0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde"]="Mint(address,address,int24,int24,uint128,uint256,uint256)"
    ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"]="Transfer(address,address,uint256)"
    ["0x3067048beee31b25b2f1681f88dac838c8bba36af25bfb2b7cf7473a5847e35f"]="IncreaseLiquidity(uint256,uint128,uint256,uint256)"
)

# KNOWN FACTORY CONTRACTS (to filter legitimate pools)
declare -A FACTORIES=(
    ["0x33128a8fc17869897dce68ed026d694621f6fdfd"]="Uniswap V3 Factory"
    ["0x03a520b32c04bf3beef7beb72e919cf822ed34f1"]="Uniswap V3 Position Manager"
)

# Function to convert hex to decimal
hex_to_dec() {
    echo $((16#${1#0x}))
}

# Function to decode address from hex
decode_address() {
    local hex_data=$1
    echo "0x${hex_data:26:40}"
}

# Function to get token info
get_token_info() {
    local token_address=$1
    
    # Get token symbol
    local symbol_response=$(curl -s -X POST -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$token_address\",\"data\":\"0x95d89b41\"},\"latest\"],\"id\":1}" \
        http://localhost:8545)
    
    # Get token name
    local name_response=$(curl -s -X POST -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$token_address\",\"data\":\"0x06fdde03\"},\"latest\"],\"id\":1}" \
        http://localhost:8545)
    
    # Extract and decode (basic hex to ASCII conversion)
    local symbol=$(echo "$symbol_response" | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
    local name=$(echo "$name_response" | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
    
    echo "$token_address|$symbol|$name"
}

# Function to analyze a block for pool events
analyze_block() {
    local block_number=$1
    echo -e "${CYAN}🔍 Analyzing Block: $block_number${NC}"
    
    # Get all logs for this block
    local logs=$(curl -s -X POST -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getLogs\",\"params\":[{\"fromBlock\":\"$block_number\",\"toBlock\":\"$block_number\"}],\"id\":1}" \
        http://localhost:8545)
    
    # Check for PoolCreated events
    if echo "$logs" | grep -q "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118"; then
        echo -e "${GREEN}🎉 NEW POOL CREATED!${NC}"
        
        # Extract pool creation details
        local pool_data=$(echo "$logs" | grep -A 20 -B 5 "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118")
        
        # Parse the topics to get token addresses
        local topics_line=$(echo "$pool_data" | grep "topics" | head -1)
        
        if [[ -n "$topics_line" ]]; then
            echo -e "${YELLOW}📊 Pool Details:${NC}"
            
            # Extract factory address
            local factory=$(echo "$pool_data" | grep '"address"' | head -1 | grep -o '"0x[^"]*"' | tr -d '"')
            echo "Factory: $factory (${FACTORIES[$factory]:-Unknown})"
            
            # Get transaction hash for more details
            local tx_hash=$(echo "$pool_data" | grep '"transactionHash"' | head -1 | grep -o '"0x[^"]*"' | tr -d '"')
            echo "Transaction: $tx_hash"
            
            # Extract token addresses from topics
            local token0=$(echo "$topics_line" | grep -o '"0x[^"]*"' | sed -n '2p' | tr -d '"')
            local token1=$(echo "$topics_line" | grep -o '"0x[^"]*"' | sed -n '3p' | tr -d '"')
            local fee=$(echo "$topics_line" | grep -o '"0x[^"]*"' | sed -n '4p' | tr -d '"')
            
            if [[ -n "$token0" && -n "$token1" ]]; then
                echo -e "${BLUE}Token0:${NC} $token0"
                echo -e "${BLUE}Token1:${NC} $token1" 
                echo -e "${BLUE}Fee Tier:${NC} $(hex_to_dec $fee) basis points"
                
                # Get token info
                echo -e "${MAGENTA}Getting token information...${NC}"
                local token0_info=$(get_token_info "$token0")
                local token1_info=$(get_token_info "$token1")
                
                echo "Token0 Info: $token0_info"
                echo "Token1 Info: $token1_info"
            fi
            
            # Get pool address from data field
            local pool_address=$(echo "$pool_data" | grep '"data"' | head -1 | grep -o '"0x[^"]*"' | tr -d '"' | tail -c 41)
            if [[ -n "$pool_address" ]]; then
                echo -e "${GREEN}Pool Address: 0x$pool_address${NC}"
            fi
            
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        fi
    fi
    
    # Check for Initialize events (pool activation)
    if echo "$logs" | grep -q "0x98636036cb66a9c19a37435efc1e90142190214e8abeb821bdba3f2990dd4c95"; then
        echo -e "${YELLOW}🚀 POOL INITIALIZED!${NC}"
    fi
    
    # Check for first Mint events (initial liquidity)
    if echo "$logs" | grep -q "0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde"; then
        echo -e "${GREEN}💰 INITIAL LIQUIDITY ADDED!${NC}"
    fi
}

# Function to monitor live blocks
monitor_live() {
    echo -e "${YELLOW}🔄 Starting live monitoring...${NC}"
    echo "Monitoring ALL pool creation events..."
    echo "Press Ctrl+C to stop"
    echo
    
    local last_block=""
    
    while true; do
        # Get latest block
        local current_block=$(curl -s -X POST -H "Content-Type: application/json" \
            -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
            http://localhost:8545 | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
        
        if [[ "$current_block" != "$last_block" && -n "$current_block" ]]; then
            analyze_block "$current_block"
            last_block="$current_block"
        fi
        
        sleep 2
    done
}

# Function to scan recent blocks
scan_recent() {
    local num_blocks=${1:-10}
    echo -e "${BLUE}🔍 Scanning last $num_blocks blocks for pool events...${NC}"
    
    # Get current block
    local current_block_hex=$(curl -s -X POST -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
        http://localhost:8545 | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
    
    local current_block=$(hex_to_dec "$current_block_hex")
    local start_block=$((current_block - num_blocks))
    
    echo "Scanning blocks $start_block to $current_block"
    echo
    
    for ((i=start_block; i<=current_block; i++)); do
        local block_hex=$(printf "0x%x" $i)
        analyze_block "$block_hex"
    done
}

# Function to show event signatures
show_signatures() {
    echo -e "${BLUE}📋 MONITORING EVENT SIGNATURES:${NC}"
    echo
    for sig in "${!EVENT_SIGNATURES[@]}"; do
        echo -e "${CYAN}$sig${NC} - ${EVENT_SIGNATURES[$sig]}"
    done
    echo
    echo -e "${YELLOW}🏭 KNOWN FACTORIES:${NC}"
    for factory in "${!FACTORIES[@]}"; do
        echo -e "${GREEN}$factory${NC} - ${FACTORIES[$factory]}"
    done
}

# Main execution
case "$1" in
    "live"|"monitor")
        monitor_live
        ;;
    "scan")
        scan_recent "${2:-10}"
        ;;
    "signatures"|"sig")
        show_signatures
        ;;
    "analyze")
        if [[ -n "$2" ]]; then
            analyze_block "$2"
        else
            echo "Usage: $0 analyze <block_number>"
        fi
        ;;
    *)
        echo -e "${YELLOW}UNIVERSAL POOL MONITOR USAGE:${NC}"
        echo "  $0 live          # Monitor live blocks for new pools"
        echo "  $0 scan [N]      # Scan last N blocks (default: 10)"
        echo "  $0 signatures    # Show monitored event signatures"
        echo "  $0 analyze <hex> # Analyze specific block"
        echo
        echo -e "${CYAN}DETECTION METHOD:${NC}"
        echo "• Monitors PoolCreated event signature (any tokens)"
        echo "• Monitors Initialize events (pool activation)"  
        echo "• Monitors Mint events (liquidity addition)"
        echo "• Automatically extracts token information"
        echo "• No need to know token addresses in advance!"
        ;;
esac 