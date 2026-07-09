import type { CaptureType } from './types';
import type { CaptureFeature } from '../features';

export const AUTO_EXPORT_ALARM_NAME = 'dy-capture-auto-export';
export const AUTO_EXPORT_INTERVAL_MINUTES = 60;
export const AUTO_EXPORT_SETTINGS_KEY = 'autoExport:settings';
export const AUTO_EXPORT_STATUS_KEY = 'autoExport:status';

export interface AutoExportSettings {
    enabled: boolean;
}

export interface AutoExportPageResult {
    captureType: CaptureType;
    displayName: string;
    ok: boolean;
    tabId: number | null;
    error: string | null;
}

export interface AutoExportFeatureResult {
    captureType: CaptureType;
    displayName: string;
    ok: boolean;
    recordCount: number;
    error: string | null;
}

export interface AutoExportStatus {
    running: boolean;
    pagesReady: boolean;
    pageResults: AutoExportPageResult[];
    featureResults: AutoExportFeatureResult[];
    /** featureId → 最后一次成功导出的 seed URL，持久化兜底用 */
    lastSeedUrl: Record<string, string>;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    nextRunAt: string | null;
}

export function createDefaultAutoExportSettings(): AutoExportSettings {
    return {
        enabled: false
    };
}

export function createDefaultAutoExportStatus(): AutoExportStatus {
    return {
        running: false,
        pagesReady: false,
        pageResults: [],
        featureResults: [],
        lastSeedUrl: {},
        lastRunAt: null,
        lastSuccessAt: null,
        lastError: null,
        nextRunAt: null
    };
}

export function getNextAutoExportTime(now = new Date()): Date {
    return new Date(now.getTime() + AUTO_EXPORT_INTERVAL_MINUTES * 60 * 1000);
}

export function getAutoExportTargetFeatureIds(features: Pick<CaptureFeature, 'id'>[]): CaptureType[] {
    return features.map(feature => feature.id);
}

export function normalizeAutoExportSettings(value: unknown): AutoExportSettings {
    if (!value || typeof value !== 'object') {
        return createDefaultAutoExportSettings();
    }

    const settings = value as Partial<AutoExportSettings>;

    return {
        enabled: settings.enabled === true
    };
}

export function normalizeAutoExportStatus(value: unknown): AutoExportStatus {
    if (!value || typeof value !== 'object') {
        return createDefaultAutoExportStatus();
    }

    const status = value as Partial<AutoExportStatus>;

    return {
        running: status.running === true,
        pagesReady: status.pagesReady === true,
        pageResults: normalizePageResults(status.pageResults),
        featureResults: normalizeFeatureResults(status.featureResults),
        lastSeedUrl: typeof status.lastSeedUrl === 'object' && status.lastSeedUrl !== null ? status.lastSeedUrl : {},
        lastRunAt: typeof status.lastRunAt === 'string' ? status.lastRunAt : null,
        lastSuccessAt: typeof status.lastSuccessAt === 'string' ? status.lastSuccessAt : null,
        lastError: typeof status.lastError === 'string' ? status.lastError : null,
        nextRunAt: typeof status.nextRunAt === 'string' ? status.nextRunAt : null
    };
}

function normalizePageResults(value: unknown): AutoExportPageResult[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter(item => item && typeof item === 'object')
        .map(item => {
            const result = item as Partial<AutoExportPageResult>;

            return {
                captureType: typeof result.captureType === 'string' ? result.captureType : '',
                displayName: typeof result.displayName === 'string' ? result.displayName : '',
                ok: result.ok === true,
                tabId: typeof result.tabId === 'number' ? result.tabId : null,
                error: typeof result.error === 'string' ? result.error : null
            };
        })
        .filter(item => item.captureType && item.displayName);
}

function normalizeFeatureResults(value: unknown): AutoExportFeatureResult[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter(item => item && typeof item === 'object')
        .map(item => {
            const result = item as Partial<AutoExportFeatureResult>;

            return {
                captureType: typeof result.captureType === 'string' ? result.captureType : '',
                displayName: typeof result.displayName === 'string' ? result.displayName : '',
                ok: result.ok === true,
                recordCount: typeof result.recordCount === 'number' ? result.recordCount : 0,
                error: typeof result.error === 'string' ? result.error : null
            };
        })
        .filter(item => item.captureType && item.displayName);
}
