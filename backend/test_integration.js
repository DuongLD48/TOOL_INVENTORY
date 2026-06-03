const sharp = require('sharp');
const vectorSearch = require('./vector_search');

async function test() {
  console.log("Creating a valid JPEG image...");
  const jpgBuffer = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  }).jpeg().toBuffer();

  const base64Jpg = `data:image/jpeg;base64,${jpgBuffer.toString('base64')}`;
  console.log("Valid JPEG base64 length:", base64Jpg.length);

  console.log("Initializing vector search...");
  await vectorSearch.init();

  const mockDb = {
    all: (query, params, cb) => {
      cb(null, []);
    }
  };

  try {
    console.log("Searching with the valid JPEG data URL...");
    const results = await vectorSearch.searchSimilarProducts(mockDb, base64Jpg);
    console.log("Success! Integration test completed. Results length:", results.length);
  } catch (err) {
    console.error("Integration test failed:", err);
  }
}

test();
