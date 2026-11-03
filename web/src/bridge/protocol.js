"use strict";
/**
 * IP SHIFT bridge protocol — SINGLE SOURCE OF TRUTH.
 * The Swift side (native/Sources/IPShiftCore/Models.swift) mirrors these shapes exactly (Codable, camelCase).
 *
 * Transport
 *  JS -> native : window.webkit.messageHandlers.ipshift.postMessage({ cmd, args })
 *                 (WKScriptMessageHandlerWithReply) resolves to BridgeReply<T>.
 *  native -> JS : window.__IPSHIFT__.dispatch(event: BridgeEvent)
 *                 called via callAsyncJavaScript with the event passed as an argument (never string-interpolated).
 * All timestamps are ISO-8601 strings (UTC). Unknown values are null, never invented.
 */
Object.defineProperty(exports, "__esModule", { value: true });
