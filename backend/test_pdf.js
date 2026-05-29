const PDFDocument = require('pdfkit');
const fs = require('fs');

const MM = 2.8346;
const PAGE_W = 100 * MM;
const PAGE_H = 22 * MM;
const LABEL_W = 35 * MM;
const MARGIN_X = 15 * MM;
const PAD = 2 * MM;

const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false });
doc.pipe(fs.createWriteStream('test_label.pdf'));
doc.addPage();

const qrX = MARGIN_X + PAD;
const qrY = PAD;
doc.rect(qrX, qrY, 18*MM, 18*MM).fill('black');
doc.font('Helvetica-Bold').fontSize(7).fillColor('black').text('TEST LABEL', qrX + 20*MM, qrY + 1*MM);

doc.end();
console.log('PDF Generated');
