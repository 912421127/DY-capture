import {
    bridgeReadyKey,
    captureKey,
    pageReadyKey,
    requestSeenKey
} from './storage';
import type {
    PageReadyPayload,
    RawCapture,
    RequestSeen
} from './types';

type StorageArea = {
    get: (keys: string[]) => Promise<Record<string, unknown>>;
    set: (values: Record<string, unknown>) => Promise<void>;
    remove: (keys: string[]) => Promise<void>;
};

export interface CaptureFeatureEntry {
    rawCapture?: RawCapture;
    bridgeReady: boolean;
    pageReadyPayload?: PageReadyPayload;
    requestSeen?: RequestSeen;
}

// storage.session 的 key 规则集中在这里，避免 background 到处拼 key。
export function createCaptureStore(storage: StorageArea) {
    const captureKeyFor = (captureType: string, tabId: number) => captureKey(captureType, tabId);
    const readyKey = (tabId: number) => bridgeReadyKey(tabId);
    const pageReadyKeyFor = (tabId: number) => pageReadyKey(tabId);
    const requestSeenKeyFor = (tabId: number) => requestSeenKey(tabId);

    async function getFeatureEntry(captureType: string, tabId: number): Promise<CaptureFeatureEntry> {
        const entry = await storage.get([
            captureKeyFor(captureType, tabId),
            readyKey(tabId),
            pageReadyKeyFor(tabId),
            requestSeenKeyFor(tabId)
        ]);

        return {
            rawCapture: entry[captureKeyFor(captureType, tabId)] as RawCapture | undefined,
            bridgeReady: Boolean(entry[readyKey(tabId)]),
            pageReadyPayload: entry[pageReadyKeyFor(tabId)] as PageReadyPayload | undefined,
            requestSeen: entry[requestSeenKeyFor(tabId)] as RequestSeen | undefined
        };
    }

    async function setRawCapture(captureType: string, tabId: number, rawCapture: RawCapture): Promise<void> {
        await storage.set({ [captureKeyFor(captureType, tabId)]: rawCapture });
    }

    async function setBridgeReady(tabId: number): Promise<void> {
        await storage.set({ [readyKey(tabId)]: true });
    }

    async function setPageReady(tabId: number, payload: PageReadyPayload): Promise<void> {
        await storage.set({ [pageReadyKeyFor(tabId)]: payload });
    }

    async function setRequestSeen(tabId: number, requestSeen: RequestSeen): Promise<void> {
        await storage.set({ [requestSeenKeyFor(tabId)]: requestSeen });
    }

    async function clearTab(captureTypes: string[], tabId: number): Promise<void> {
        await storage.remove([
            ...captureTypes.map(captureType => captureKeyFor(captureType, tabId)),
            readyKey(tabId),
            pageReadyKeyFor(tabId),
            requestSeenKeyFor(tabId)
        ]);
    }

    return {
        getFeatureEntry,
        setRawCapture,
        setBridgeReady,
        setPageReady,
        setRequestSeen,
        clearTab
    };
}

export type CaptureStore = ReturnType<typeof createCaptureStore>;
