import QRCode from 'https://esm.sh/qrcode@1.5.4';

export function buildProfileUrl(username) {
  return `${window.location.origin}/profile.html?u=${encodeURIComponent(username)}`;
}

export function buildItemSlotUrl(collectionId, itemId) {
  return `${window.location.origin}/collection.html?id=${collectionId}&item=${itemId}`;
}

export async function renderQrToDataUrl(url) {
  return await QRCode.toDataURL(url, {
    width: 240,
    margin: 2,
    color: { dark: '#18181b', light: '#ffffff' },
  });
}
