const sharp = require('sharp');

async function test() {
  console.log("Loading sharp...");
  // Create 100x100 white image buffer
  const buffer = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  }).png().toBuffer();

  console.log("Resizing image using sharp...");
  const { data, info } = await sharp(buffer)
    .resize(224, 224)
    .raw()
    .toBuffer({ resolveWithObject: true });

  console.log("Success! Output info:", info);
}

test().catch(err => {
  console.error("Test failed:", err);
});
