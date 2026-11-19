const sharp = require('sharp');
const blockhash = require('blockhash-core');

// Convert base64 to optimized WebP and calculate perceptual hash
const processImage = async (base64String) => {
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
    // blockhash requires raw pixel data
    const { data, info } = await sharp(buffer)
      .resize(32, 32, { fit: 'fill' }) // Resize to standard 32x32 for hashing
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Generate 64-bit blockhash (hex string)
    const hash = blockhash.bmvbhash({ width: info.width, height: info.height, data }, 8);

    return { optimizedImage: optimizedBase64, hash };
  } catch (error) {
    console.error('Image processing error:', error);
    throw new Error('Failed to process image');
  }
};

// Calculate Hamming distance between two hex hashes
const hammingDistance = (hash1, hash2) => {
  let distance = 0;
  let val1 = BigInt('0x' + hash1);
  let val2 = BigInt('0x' + hash2);
  let xor = val1 ^ val2;
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
};

module.exports = { processImage, hammingDistance };
