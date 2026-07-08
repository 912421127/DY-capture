import type { AutoExportFeatureResult } from './autoExport';
import type { CaptureType } from './types';

export interface AutoExportFeatureLike {
    id: CaptureType;
    displayName: string;
}

export async function runAutoExportFeatures<T extends AutoExportFeatureLike>(
    features: T[],
    runFeature: (feature: T) => Promise<number>
): Promise<AutoExportFeatureResult[]> {
    const results: AutoExportFeatureResult[] = [];

    for (const feature of features) {
        try {
            const recordCount = await runFeature(feature);

            results.push({
                captureType: feature.id,
                displayName: feature.displayName,
                ok: true,
                recordCount,
                error: null
            });
        } catch (error) {
            results.push({
                captureType: feature.id,
                displayName: feature.displayName,
                ok: false,
                recordCount: 0,
                error: getErrorMessage(error)
            });
        }
    }

    return results;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error) || '自动导出失败。';
}
