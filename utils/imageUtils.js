let sharp = null;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('Sharp module not available, using fallback:', e.message);
}

let blockhash = null;
try {
  blockhash = require('blockhash-core');
} catch (e) {
  console.warn('Blockhash module not available, using fallback:', e.message);
}

// Convert base64 to optimized WebP and calculate perceptual hash
const processImage = async (base64String) => {
  if (!base64String) return { optimizedImage: '', hash: '' };
  if (!sharp || !blockhash) {
    return { optimizedImage: base64String, hash: 'no-hash' };
  }
  try {
    // Extract base64 data
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // 1. Resize and Compress to lightweight WebP
    const optimizedBuffer = await sharp(buffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();

    const optimizedBase64 = `data:image/webp;base64,${optimizedBuffer.toString('base64')}`;

    // 2. Calculate Perceptual Hash (Blockhash)
    const { data, info } = await sharp(buffer)
      .resize(32, 32, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Generate 64-bit blockhash (hex string)
    const hash = blockhash.bmvbhash({ width: info.width, height: info.height, data }, 8);

    return { optimizedImage: optimizedBase64, hash };
  } catch (error) {
    console.error('Image processing fallback:', error.message);
    return { optimizedImage: base64String, hash: 'err-hash' };
  }
};

// Calculate Hamming distance between two hex hashes
const hammingDistance = (hash1, hash2) => {
  if (!hash1 || !hash2 || hash1 === 'no-hash' || hash2 === 'no-hash') return 100;
  try {
    let distance = 0;
    let val1 = BigInt('0x' + hash1);
    let val2 = BigInt('0x' + hash2);
    let xor = val1 ^ val2;
    while (xor > 0n) {
      distance += Number(xor & 1n);
      xor >>= 1n;
    }
    return distance;
  } catch {
    return 100;
  }
};

module.exports = { processImage, hammingDistance };
