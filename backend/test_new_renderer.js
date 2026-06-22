const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');

// Test data
const testOrder = {
  orderId: "TEST-0001",
  trackingId: "TEST-TRACKING-12345",
  date: new Date().toLocaleDateString("vi-VN"),
  productItems: [
    { name: "SẢN PHẨM IN THỬ MẪU A - SIZE M", quantity: 1 },
    { name: "SẢN PHẨM IN THỬ MẪU B - SIZE L", quantity: 2 }
  ],
  product: "",
  importSheetType: "TEST_SHEET"
};

const PAGE_W_MM = 100;
const PAGE_H_MM = 150;
const MM = 2.8346;
const PAGE_W = PAGE_W_MM * MM;
const PAGE_H = PAGE_H_MM * MM;
const PAD = 8 * MM;

const renderOrderPage = async (doc, order, fontRegular, fontBold) => {
  const nfc = (s) => (s || '').normalize('NFC');
  
  // 1. Draw Date
  const dateText = nfc(order.date || '');
  doc.font(fontBold).fontSize(10.5).fillColor('black');
  const dateHeight = doc.currentLineHeight();
  const dateY = PAD;
  doc.text(dateText, PAD, dateY, { width: PAGE_W - 2 * PAD, align: 'right' });
  
  let currentY = dateY + dateHeight + 3 * MM;
  
  // 2. Draw Code Container (Barcode & QR)
  const codeContainerH = 52.5; // 70px * 0.75
  const qrSize = 52.5; // 70px * 0.75
  const gap = 5 * MM; // 14.17pt
  
  // Draw Barcode on the left
  const barcodeX = PAD;
  const barcodeY = currentY;
  const barcodeMaxW = (PAGE_W - 2 * PAD) - qrSize - gap;
  
  try {
    const barcodeBuffer = await bwipjs.toBuffer({
      bcid: 'code128',
      text: order.trackingId || 'N/A',
      scale: 3,
      height: 10,
      includetext: false
    });
    // Clip the barcode to simulate overflow: hidden
    doc.save();
    doc.rect(barcodeX, barcodeY, barcodeMaxW, codeContainerH).clip();
    doc.image(barcodeBuffer, barcodeX, barcodeY, { height: codeContainerH });
    doc.restore();
  } catch (barErr) {
    console.error(`[Printer] Không thể tạo barcode cho trackingId: ${order.trackingId}`, barErr.message);
  }
  
  // Draw QR on the right
  const qrX = PAGE_W - PAD - qrSize;
  const qrY = currentY;
  try {
    const qrBuffer = await QRCode.toBuffer(order.trackingId || 'N/A', {
      type: 'png',
      width: 150,
      margin: 0,
      color: { dark: '#000000', light: '#FFFFFF' }
    });
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
  } catch (qrErr) {
    console.error(`[Printer] Không thể tạo QR code cho trackingId: ${order.trackingId}`, qrErr.message);
  }
  
  currentY += codeContainerH + 3 * MM;
  
  // 3. Draw Tracking
  const trackingText = nfc(`Tracking: ${order.trackingId || ''}`);
  doc.font(fontBold).fontSize(10.5).fillColor('black');
  const trackingH = doc.heightOfString(trackingText, { width: PAGE_W - 2 * PAD });
  doc.text(trackingText, PAD, currentY, { width: PAGE_W - 2 * PAD });
  
  currentY += trackingH + 3 * MM;
  
  // 4. Draw Order ID (optional)
  if (order.orderId) {
    const orderIdText = nfc(`Order ID: ${order.orderId}`);
    doc.font(fontBold).fontSize(9.75).fillColor('black');
    const orderIdH = doc.heightOfString(orderIdText, { width: PAGE_W - 2 * PAD });
    doc.text(orderIdText, PAD, currentY, { width: PAGE_W - 2 * PAD });
    currentY += orderIdH + 3 * MM;
  }
  
  // 5. Draw Invoice Box
  const boxX = PAD;
  const boxY = currentY;
  const boxW = PAGE_W - 2 * PAD;
  const boxH = PAGE_H - boxY - PAD;
  
  doc.rect(boxX, boxY, boxW, boxH).lineWidth(1.5).dash(4, { space: 4 }).stroke();
  doc.undash();
  
  // Content inside the box
  let boxContentY = boxY + 5 * MM;
  
  // Draw PRODUCT title
  doc.font(fontBold).fontSize(9).fillColor('black');
  doc.text('PRODUCT', boxX + 5 * MM, boxContentY);
  const titleHeight = doc.currentLineHeight();
  
  boxContentY += titleHeight + 2 * MM;
  
  // Draw Product Items
  const productX = boxX + 5 * MM;
  const productW = boxW - 10 * MM;
  
  if (Array.isArray(order.productItems) && order.productItems.length > 0) {
    for (const item of order.productItems) {
      const nameText = nfc(item.name || '');
      const qtyText = item.quantity > 1 ? `x${item.quantity}` : '';
      
      doc.font(fontBold).fontSize(10.5).fillColor('black');
      
      if (qtyText) {
        const qtyW = 10 * MM;
        const qtyX = boxX + boxW - 5 * MM - qtyW;
        const nameW = qtyX - productX - 2 * MM;
        
        const nameH = doc.heightOfString(nameText, { width: nameW });
        doc.text(nameText, productX, boxContentY, { width: nameW });
        doc.text(qtyText, qtyX, boxContentY, { width: qtyW, align: 'right' });
        
        boxContentY += nameH + 3; // 3pt gap
      } else {
        const nameH = doc.heightOfString(nameText, { width: productW });
        doc.text(nameText, productX, boxContentY, { width: productW });
        
        boxContentY += nameH + 3; // 3pt gap
      }
    }
  } else {
    doc.font(fontBold).fontSize(10.5).fillColor('black');
    const fallbackText = nfc(order.product || '');
    doc.text(fallbackText, productX, boxContentY, { width: productW });
  }
};

const run = async () => {
  const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false });
  const pdfPath = path.join(__dirname, 'test_rendered_layout.pdf');
  const writeStream = fs.createWriteStream(pdfPath);
  doc.pipe(writeStream);
  
  const hasSegoe = fs.existsSync('C:\\Windows\\Fonts\\segoeui.ttf') && fs.existsSync('C:\\Windows\\Fonts\\seguisb.ttf');
  const hasArial = !hasSegoe && fs.existsSync('C:\\Windows\\Fonts\\arial.ttf') && fs.existsSync('C:\\Windows\\Fonts\\arialbd.ttf');
  if (hasSegoe) {
    doc.registerFont('VNRegular', 'C:\\Windows\\Fonts\\segoeui.ttf');
    doc.registerFont('VNBold', 'C:\\Windows\\Fonts\\seguisb.ttf');
  } else if (hasArial) {
    doc.registerFont('VNRegular', 'C:\\Windows\\Fonts\\arial.ttf');
    doc.registerFont('VNBold', 'C:\\Windows\\Fonts\\arialbd.ttf');
  }
  const fontRegular = (hasSegoe || hasArial) ? 'VNRegular' : 'Helvetica';
  const fontBold = (hasSegoe || hasArial) ? 'VNBold' : 'Helvetica-Bold';
  
  doc.addPage();
  await renderOrderPage(doc, testOrder, fontRegular, fontBold);
  doc.end();
  
  writeStream.on('finish', () => {
    console.log('Finished writing test_rendered_layout.pdf!');
  });
};

run();
