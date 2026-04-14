// src/types.ts
// Version: 1.0.0 | Strict TypeScript — zero 'any'
export var IntentStatus;
(function (IntentStatus) {
    IntentStatus["PENDING"] = "PENDING";
    IntentStatus["MONITORING"] = "MONITORING";
    IntentStatus["TRIGGERED"] = "TRIGGERED";
    IntentStatus["SUBMITTED"] = "SUBMITTED";
    IntentStatus["CONFIRMED"] = "CONFIRMED";
    IntentStatus["SETTLED"] = "SETTLED";
    IntentStatus["FAILED"] = "FAILED";
    IntentStatus["REVERTED"] = "REVERTED";
    IntentStatus["CANCELLED"] = "CANCELLED";
    IntentStatus["STALE"] = "STALE";
    IntentStatus["UNCERTAIN"] = "UNCERTAIN";
})(IntentStatus || (IntentStatus = {}));
export var IntentType;
(function (IntentType) {
    IntentType["LIMIT_BUY"] = "LIMIT_BUY";
    IntentType["LIMIT_SELL"] = "LIMIT_SELL";
    IntentType["STOP_LOSS"] = "STOP_LOSS";
    IntentType["OCO"] = "OCO";
})(IntentType || (IntentType = {}));
export var SupportedChain;
(function (SupportedChain) {
    SupportedChain["ETHEREUM"] = "ethereum";
    SupportedChain["ARBITRUM"] = "arbitrum";
    SupportedChain["OPTIMISM"] = "optimism";
    SupportedChain["POLYGON"] = "polygon";
    SupportedChain["XLAYER"] = "xlayer";
    SupportedChain["MANTLE"] = "mantle";
})(SupportedChain || (SupportedChain = {}));
export var PriceConfidence;
(function (PriceConfidence) {
    PriceConfidence["HIGH"] = "HIGH";
    PriceConfidence["MEDIUM"] = "MEDIUM";
    PriceConfidence["LOW"] = "LOW";
})(PriceConfidence || (PriceConfidence = {}));
