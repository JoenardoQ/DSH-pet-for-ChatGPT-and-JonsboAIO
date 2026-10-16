import packageInfo from '../../package.json' with { type: 'json' };
export const ASSET_VERSION = packageInfo.version;
export const versionedAsset = (path: string): string => path + (path.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(ASSET_VERSION);
