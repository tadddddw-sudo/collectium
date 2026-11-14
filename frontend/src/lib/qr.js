import QRCode from 'qrcode';

export function buildProfileUrl(username) {
  return `${location.origin}/profile?u=${encodeURIComponent(username)}`;
}

export function buildItemUrl(collectionId, itemId) {
  return `${location.origin}/collection?id=${encodeURIComponent(collectionId)}&item=${encodeURIComponent(itemId)}`;
}

export async function renderQrToDataUrl(url) {
  return QRCode.toDataURL(url, {
    width: 240,
    margin: 2,
    color: { dark: '#0b0c0e', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });
}
