"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeAPI = void 0;
const ethers_1 = require("ethers");
const helpers_1 = require("../utils/helpers");
const signing_1 = require("../utils/signing");
const constants_1 = require("../types/constants");
const IS_MAINNET = true; // Make sure this matches the IS_MAINNET in signing.ts
class ExchangeAPI {
    constructor(baseURL, privateKey, info, rateLimiter, symbolConversion) {
        this.info = info;
        this.httpApi = new helpers_1.HttpApi(baseURL, constants_1.ENDPOINTS.EXCHANGE, rateLimiter);
        this.wallet = new ethers_1.ethers.Wallet(privateKey);
        this.symbolConversion = symbolConversion;
    }
    async getAssetIndex(symbol) {
        const index = await this.symbolConversion.getAssetIndex(symbol);
        if (index === undefined) {
            throw new Error(`Unknown asset: ${symbol}`);
        }
        return index;
    }
    async placeOrder(orderRequest, vaultAddress = null) {
        try {
            const assetIndex = await this.getAssetIndex(orderRequest.coin);
            const orderWire = (0, signing_1.orderRequestToOrderWire)(orderRequest, assetIndex);
            const action = (0, signing_1.orderWiresToOrderAction)([orderWire]);
            const nonce = Date.now();
            const signature = await (0, signing_1.signL1Action)(this.wallet, action, vaultAddress, nonce);
            const payload = { action, nonce, signature, vaultAddress };
            return this.httpApi.makeRequest(payload, 1);
        }
        catch (error) {
            throw error;
        }
    }
    //Cancel using order id (oid)
    async cancelOrder(cancelRequests) {
        try {
            const cancels = Array.isArray(cancelRequests) ? cancelRequests : [cancelRequests];
            // Ensure all cancel requests have asset indices
            const cancelsWithIndices = await Promise.all(cancels.map(async (req) => ({
                ...req,
                a: await this.getAssetIndex(req.coin)
            })));
            const action = {
                type: constants_1.ExchangeType.CANCEL,
                cancels: cancelsWithIndices.map(({ a, o }) => ({ a, o }))
            };
            const nonce = Date.now();
            const signature = await (0, signing_1.signL1Action)(this.wallet, action, null, nonce);
            const payload = { action, nonce, signature };
            return this.httpApi.makeRequest(payload, 1);
        }
        catch (error) {
            throw error;
        }
    }
    //Cancel using a CLOID
    async cancelOrderByCloid(symbol, cloid) {
        try {
            const assetIndex = await this.getAssetIndex(symbol);
            const action = {
                type: constants_1.ExchangeType.CANCEL_BY_CLOID,
                cancels: [{ asset: assetIndex, cloid }]
            };
            const nonce = Date.now();
            const signature = await (0, signing_1.signL1Action)(this.wallet, action, null, nonce);
            const payload = { action, nonce, signature };
            return this.httpApi.makeRequest(payload, 1);
        }
        catch (error) {
            throw error;
        }
    }
    //Modify a single order
    async modifyOrder(oid, orderRequest) {
        try {
            const assetIndex = await this.getAssetIndex(orderRequest.coin);
            const orderWire = (0, signing_1.orderRequestToOrderWire)(orderRequest, assetIndex);
            const action = {
                type: constants_1.ExchangeType.MODIFY,
                oid,
                order: orderWire
            };
            const nonce = Date.now();
            const signature = await (0, signing_1.signL1Action)(this.wallet, action, null, nonce);
            const payload = { action, nonce, signature };
            return this.httpApi.makeRequest(payload, 1);
        }
        catch (error) {
            throw error;
        }
    }
    //Modify multiple orders at once
    async batchModifyOrders(modifies) {
        try {
            // First, get all asset indices in parallel
            const assetIndices = await Promise.all(modifies.map(m => this.getAssetIndex(m.order.coin)));
            const action = {
                type: constants_1.ExchangeType.BATCH_MODIFY,
                modifies: modifies.map((m, index) => {
                    return {
                        oid: m.oid,
                        order: (0, signing_1.orderRequestToOrderWire)(m.order, assetIndices[index])
                    };
                })
            };
            const nonce = Date.now();
            const signature = await (0, signing_1.signL1Action)(this.wallet, action, null, nonce);
            const payload = { action, nonce, signature };
            return this.httpApi.makeRequest(payload, 1);
        }
        catch (error) {
            throw error;
        }
    }
    //Update leverage. Set leverageMode to "cross" if you want cross leverage, otherwise it'll set it to "isolated by default"
    async updateLeverage(symbol, leverageMode, leverage) {
        try {
            const assetIndex = await this.getAssetIndex(symbol);
            const action = {
                type: constants_1.ExchangeType.UPDATE_LEVERAGE,
                asset: assetIndex,
                isCross: leverageMode === "cross",
                leverage: leverage
            };
            const nonce = Date.now();
            const signature = await (0, signing_1.signL1Action)(this.wallet, action, null, nonce);
            const payload = { action, nonce, signature };
            return this.httpApi.makeRequest(payload, 1);
        }
        catch (error) {
            throw error;
        }
    }
    //Update how much margin there is on a perps position
    async updateIsolatedMargin(symbol, isBuy, ntli) {
        try {
            const assetIndex = await this.getAssetIndex(symbol);
            const action = {
                type: constants_1.ExchangeType.UPDATE_ISOLATED_MARGIN,
                asset: assetIndex,
                isBuy,
                ntli
            };
            const nonce = Date.now();
            const signature = await (0, signing_1.signL1Action)(this.wallet, action, null, nonce);
            const payload = { action, nonce, signature };
            return this.httpApi.makeRequest(payload, 1);
        }
        catch (error) {
            throw error;
        }
    }
    //Takes from the perps wallet and sends to another wallet without the $1 fee (doesn't touch bridge, so no fees)
    async usdTransfer(destination, amount) {
        try {
            const action = {
                type: constants_1.ExchangeType.USD_SEND,
                hyperliquidChain: IS_MAINNET ? 'Mainnet' : 'Testnet',
                signatureChainId: '0xa4b1',
                destination: destination,
                amount: amount.toString(),
                time: Date.now()
            };
            const signature = await (0, signing_1.signUsdTransferAction)(this.wallet, action);
            const payload = { action, nonce: action.time, signature };
            return this.httpApi.makeRequest(payload, 1);
        }
        catch (error) {
            throw error;
        }
    }
    //Transfer SPOT assets i.e PURR to another wallet (doesn't touch bridge, so no fees)
    async spotTransfer(destination, token, amount) {
        try {
            const action = {
                type: constants_1.ExchangeType.SPOT_SEND,
                hyperliquidChain: IS_MAINNET ? 'Mainnet' : 'Testnet',
                signatureChainId: '0xa4b1',
                destination,
                token,
                amount,
                time: Date.now()
            };
            const signature = await (0, signing_1.signUserSignedAction)(this.wallet, action, [
                { name: 'hyperliquidChain', type: 'string' },
                { name: 'destination', type: 'string' },
                { name: 'token', type: 'string' },
                { name: 'amount', type: 'string' },
                { name: 'time', type: 'uint64' }
            ], 'HyperliquidTransaction:SpotSend');
            const payload = { action, nonce: action.time, signature };
            return this.httpApi.makeRequest(payload, 1);
        }
        catch (error) {
            throw error;
        }
    }
    //Withdraw USDC, this txn goes across the bridge and costs $1 in fees as of writing this
    async initiateWithdrawal(destination, amount) {
        try {
            const action = {
                type: constants_1.ExchangeType.WITHDRAW,
                hyperliquidChain: IS_MAINNET ? 'Mainnet' : 'Testnet',
                signatureChainId: '0xa4b1',
                destination: destination,
                amount: amount.toString(),
                time: Date.now()
            };
            const signature = await (0, signing_1.signWithdrawFromBridgeAction)(this.wallet, action);
            const payload = { action, nonce: action.time, signature };
            return this.httpApi.makeRequest(payload, 1);
        }
        catch (error) {
            throw error;
        }
    }
    //Transfer between spot and perpetual wallets (intra-account transfer)
    async transferBetweenSpotAndPerp(usdc, toPerp) {
        try {
            const action = {
                type: constants_1.ExchangeType.SPOT_USER,
                classTransfer: {
                    usdc: usdc * 1e6,
                    toPerp: toPerp
                }
            };
            const nonce = Date.now();
            const signature = await (0, signing_1.signL1Action)(this.wallet, action, null, nonce);
            const payload = { action, nonce, signature };
            return this.httpApi.makeRequest(payload, 1);
        }
        catch (error) {
            throw error;
        }
    }
    //Schedule a cancel for a given time (in ms) //Note: Only available once you've traded $1 000 000 in volume
    async scheduleCancel(time) {
        try {
            const action = { type: constants_1.ExchangeType.SCHEDULE_CANCEL, time };
            const nonce = Date.now();
            const signature = await (0, signing_1.signL1Action)(this.wallet, action, null, nonce);
            const payload = { action, nonce, signature };
            return this.httpApi.makeRequest(payload, 1);
        }
        catch (error) {
            throw error;
        }
    }
    //Transfer between vault and perpetual wallets (intra-account transfer)
    async vaultTransfer(vaultAddress, isDeposit, usd) {
        try {
            const action = {
                type: constants_1.ExchangeType.VAULT_TRANSFER,
                vaultAddress,
                isDeposit,
                usd
            };
            const nonce = Date.now();
            const signature = await (0, signing_1.signL1Action)(this.wallet, action, null, nonce);
            const payload = { action, nonce, signature };
            return this.httpApi.makeRequest(payload, 1);
        }
        catch (error) {
            throw error;
        }
    }
    async setReferrer(code) {
        try {
            const action = {
                type: constants_1.ExchangeType.SET_REFERRER,
                code
            };
            const nonce = Date.now();
            const signature = await (0, signing_1.signL1Action)(this.wallet, action, null, nonce);
            const payload = { action, nonce, signature };
            return this.httpApi.makeRequest(payload, 1);
        }
        catch (error) {
            throw error;
        }
    }
}
exports.ExchangeAPI = ExchangeAPI;
//# sourceMappingURL=exchange.js.map