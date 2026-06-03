const sharp = require('sharp');
const vectorSearch = require('./vector_search');

async function test() {
  console.log("Initializing vector search...");
  await vectorSearch.init();

  console.log("Creating JPEG buffer...");
  const jpgBuffer = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  }).jpeg().toBuffer();

  try {
    console.log("Resizing with .resize(224, 224, { fit: 'fill' }).removeAlpha().raw().toBuffer()...");
    const { data, info } = await sharp(jpgBuffer)
      .resize(224, 224, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    console.log("Success! info:", info);
  } catch (err) {
    console.error("Failed:", err);
  }
}

test();
