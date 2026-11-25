import { AdapterKind } from '../domain/adapter';

export const KIND_ICONS: Record<AdapterKind, string> = {
  ble: 'bluetooth',
  wifi: 'wifi',
  mfi: 'device-mobile-code',
};
