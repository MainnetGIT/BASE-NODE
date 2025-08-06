#!/bin/bash

# BASE Network DeFi Activity Monitor
# Server: 185.191.117.142
# RPC: http://localhost:8545 (BASE Mainnet - Chain ID 8453)

echo "🚀 BASE Network DeFi Activity Monitor"
echo "📡 Monitoring: Token Creation, Liquidity Pools, DEX Events"
echo "⏰ $(date)"
echo "======================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Common DEX and DeFi contract addresses on BASE
declare -A CONTRACTS=(
    ["0x4200000000000000000000000000000000000006"]="WETH (Wrapped Ether)"
    ["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"]="USDC"
    ["0x50c5725949a6f0c72e6c4a641f24049a917db0cb"]="DAI"
    ["0x2ae3f1ec7337f0e2a5f20b7a2d2b37c77eec8f7b"]="cbETH"
    ["0x827922686190790b37229fd06084350e74485b72"]="cbBTC"
    ["0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42"]="BALD"
    ["0x19ceead7105607cd444f5ad10dd51356436095a1"]="Uniswap V3 Router"
    ["0x19ceead7105607cd444f5ad10dd51356436095a1"]="Uniswap V3 SwapRouter"
    ["0x8909dc15e40173ff4699343b6eb8132c65e18ec6"]="Uniswap V3 Factory"
    ["0x6877b1b0c6267e0ad9aa4c0df18a547aa2f6b08d"]="DEX Aggregator"
)

# Event signatures for monitoring
declare -A EVENT_SIGS=(
    ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"]="Transfer"
    ["0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"]="Approval"
    ["0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118"]="PoolCreated (Uniswap V3)"
    ["0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83"]="Swap (Uniswap V3)"
    ["0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f"]="Swap (Generic)"
    ["0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1"]="Sync (Liquidity Pool)"
    ["0x40d0efd1a53d60ecbf40971b9daf7dc90178c3aadc7aab1765632738fa8b8f01"]="Deposit"
    ["0x3067048beee31b25b2f1681f88dac838c8bba36af25bfb2b7cf7473a5847e35f"]="Mint"
    ["0x26f6a048ee9138f2c0ce266f322cb99228e8d619ae2bff30c67f8dcf9d2377b4"]="Burn"
    ["0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0"]="IncreaseLiquidity"
    ["0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c"]="DecreaseLiquidity"
)

# Function to get recent blocks and analyze
monitor_recent_activity() {
    local blocks_to_check=${1:-3}
    echo -e "\n${BLUE}📊 Analyzing last $blocks_to_check blocks for DeFi activity...${NC}"
    
    # Get latest block number
    local latest_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
        http://localhost:8545)
    
    local latest_block_hex=$(echo "$latest_response" | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
    local latest_block_dec=$((16#${latest_block_hex#0x}))
    
    echo -e "   ${GREEN}✅ Latest block: $latest_block_dec ($latest_block_hex)${NC}"
    
    # Analyze recent blocks
    for ((i=0; i<blocks_to_check; i++)); do
        local block_num=$((latest_block_dec - i))
        local block_hex="0x$(printf "%x" $block_num)"
        
        echo -e "\n${CYAN}🔍 Block $block_num analysis:${NC}"
        analyze_block_defi_activity "$block_hex" "$block_num"
    done
}

# Function to analyze a specific block for DeFi activity
analyze_block_defi_activity() {
    local block_hex=$1
    local block_num=$2
    
    # Get logs for this block
    local logs_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getLogs\",\"params\":[{\"fromBlock\":\"$block_hex\",\"toBlock\":\"$block_hex\"}],\"id\":1}" \
        http://localhost:8545)
    
    # Count different types of events
    local transfer_count=$(echo "$logs_response" | grep -c "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" || echo "0")
    local swap_count=$(echo "$logs_response" | grep -c "0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83\|0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f" || echo "0")
    local sync_count=$(echo "$logs_response" | grep -c "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1" || echo "0")
    local liquidity_count=$(echo "$logs_response" | grep -c "0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0\|0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c" || echo "0")
    local mint_burn_count=$(echo "$logs_response" | grep -c "0x3067048beee31b25b2f1681f88dac838c8bba36af25bfb2b7cf7473a5847e35f\|0x26f6a048ee9138f2c0ce266f322cb99228e8d619ae2bff30c67f8dcf9d2377b4" || echo "0")
    
    echo -e "   ${GREEN}📈 Transfers: $transfer_count${NC}"
    echo -e "   ${YELLOW}🔄 Swaps: $swap_count${NC}"
    echo -e "   ${MAGENTA}💧 Liquidity Events: $liquidity_count${NC}"
    echo -e "   ${CYAN}⚡ Sync Events: $sync_count${NC}"
    echo -e "   ${BLUE}🪙 Mint/Burn: $mint_burn_count${NC}"
    
    # Look for specific DeFi contract interactions
    check_known_contracts "$logs_response"
    
    # Look for new token creations (ERC20 contract deployments)
    check_new_tokens "$block_hex" "$block_num"
}

# Function to check for interactions with known DeFi contracts
check_known_contracts() {
    local logs_response="$1"
    local found_contracts=()
    
    for address in "${!CONTRACTS[@]}"; do
        if echo "$logs_response" | grep -qi "$address"; then
            found_contracts+=("${CONTRACTS[$address]} ($address)")
        fi
    done
    
    if [ ${#found_contracts[@]} -gt 0 ]; then
        echo -e "   ${GREEN}🏦 DeFi Contracts Active:${NC}"
        for contract in "${found_contracts[@]}"; do
            echo -e "     ↳ $contract"
        done
    fi
}

# Function to check for new token deployments
check_new_tokens() {
    local block_hex=$1
    local block_num=$2
    
    # Get block with transactions
    local block_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBlockByNumber\",\"params\":[\"$block_hex\",true],\"id\":1}" \
        http://localhost:8545)
    
    # Count contract creations (transactions with null 'to' field)
    local contract_creations=$(echo "$block_response" | grep -c '"to":null' || echo "0")
    
    if [ "$contract_creations" -gt 0 ]; then
        echo -e "   ${YELLOW}🆕 Contract Creations: $contract_creations (possible new tokens)${NC}"
    fi
}

# Function to monitor live events
monitor_live_events() {
    echo -e "\n${BLUE}🔴 LIVE DeFi Event Monitor (Ctrl+C to stop)${NC}"
    echo -e "Checking for new events every 5 seconds...\n"
    
    local last_block=0
    
    while true; do
        # Get latest block
        local latest_response=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
            http://localhost:8545)
        
        local current_block_hex=$(echo "$latest_response" | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
        local current_block_dec=$((16#${current_block_hex#0x}))
        
        if [ "$current_block_dec" -gt "$last_block" ]; then
            echo -e "${GREEN}🆕 New Block: $current_block_dec${NC} ($(date '+%H:%M:%S'))"
            analyze_block_defi_activity "$current_block_hex" "$current_block_dec"
            last_block=$current_block_dec
        fi
        
        sleep 5
    done
}

# Function to search for specific token activity
search_token_activity() {
    local token_address=${1:-"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"} # Default to USDC
    local blocks_back=${2:-5}
    
    echo -e "\n${BLUE}🔍 Searching for activity for token: $token_address${NC}"
    echo -e "Looking back $blocks_back blocks...\n"
    
    # Get latest block
    local latest_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
        http://localhost:8545)
    
    local latest_block_hex=$(echo "$latest_response" | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
    local latest_block_dec=$((16#${latest_block_hex#0x}))
    local from_block_dec=$((latest_block_dec - blocks_back))
    local from_block_hex="0x$(printf "%x" $from_block_dec)"
    
    # Search for transfer events for this token
    local transfer_logs=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getLogs\",\"params\":[{\"fromBlock\":\"$from_block_hex\",\"toBlock\":\"$latest_block_hex\",\"address\":\"$token_address\",\"topics\":[\"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\"]}],\"id\":1}" \
        http://localhost:8545)
    
    local transfer_count=$(echo "$transfer_logs" | grep -c '"logIndex"' || echo "0")
    echo -e "${GREEN}✅ Found $transfer_count transfer events for this token${NC}"
    
    if [ "$transfer_count" -gt 0 ]; then
        echo -e "${CYAN}💱 Recent transfer activity detected!${NC}"
    fi
}

# Main menu
show_menu() {
    echo -e "\n${YELLOW}📋 BASE DeFi Monitor Options:${NC}"
    echo "1. Analyze recent blocks (default: 3 blocks)"
    echo "2. Monitor live DeFi events"
    echo "3. Search specific token activity"
    echo "4. Quick DeFi overview"
    echo "5. Exit"
    echo -n "Select option (1-5): "
}

# Quick overview function
quick_overview() {
    echo -e "\n${BLUE}⚡ Quick DeFi Overview${NC}"
    
    # Get latest block and analyze
    local latest_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
        http://localhost:8545)
    
    local latest_block_hex=$(echo "$latest_response" | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
    local latest_block_dec=$((16#${latest_block_hex#0x}))
    
    echo -e "📊 Latest Block: $latest_block_dec"
    echo -e "📡 Chain: BASE Mainnet (Chain ID: 8453)"
    echo -e "🏦 Monitoring: Uniswap V3, DEX Aggregators, Major Tokens"
    
    analyze_block_defi_activity "$latest_block_hex" "$latest_block_dec"
}

# Check if running with arguments
if [ $# -gt 0 ]; then
    case $1 in
        "recent")
            monitor_recent_activity ${2:-3}
            ;;
        "live")
            monitor_live_events
            ;;
        "token")
            search_token_activity $2 ${3:-5}
            ;;
        "overview")
            quick_overview
            ;;
        *)
            echo "Usage: $0 [recent|live|token|overview] [args...]"
            echo "  recent [num_blocks] - Analyze recent blocks"
            echo "  live - Monitor live events"
            echo "  token [address] [blocks_back] - Search token activity"
            echo "  overview - Quick DeFi overview"
            ;;
    esac
else
    # Interactive mode
    while true; do
        show_menu
        read -r choice
        case $choice in
            1)
                echo -n "Number of blocks to analyze (default 3): "
                read -r blocks
                blocks=${blocks:-3}
                monitor_recent_activity $blocks
                ;;
            2)
                monitor_live_events
                ;;
            3)
                echo -n "Enter token address (default USDC): "
                read -r token_addr
                token_addr=${token_addr:-"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"}
                echo -n "Blocks to look back (default 5): "
                read -r blocks_back
                blocks_back=${blocks_back:-5}
                search_token_activity "$token_addr" "$blocks_back"
                ;;
            4)
                quick_overview
                ;;
            5)
                echo -e "\n${GREEN}👋 Goodbye!${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}❌ Invalid option. Please select 1-5.${NC}"
                ;;
        esac
    done
fi 