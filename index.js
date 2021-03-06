const fs = require('fs');
const path = require('path');
const simpleParser = require('mailparser').simpleParser;
const { PDFNet } = require('@pdftron/pdfnet-node');

const OFFICE_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const convertEmailToPDF = (pathToEmail) => {
  fs.readFile(path.resolve(__dirname, pathToEmail), function (err, data) {
    simpleParser(data, {}, (err, parsed) => {
      const html = `
      <div>
        <div>extra div element is needed for padding</div>
        <div><b>from: </b>${parsed.from.html}</div>
        <div><b>to: </b>${parsed.to.html}</div>
        <div><b>subject: </b>${parsed.subject}</div>
      </div><br>${parsed.html}`;

      // create the PDF from the email body
      convertHTMLToPDF(html, 'converted');

      // create PDFs for each of the attachments
      if (parsed.attachments && parsed.attachments.length > 0) {
        parsed.attachments.forEach((attachment, i) => {
          let name = `converted_attachment${i}`;
          if (attachment.contentType === 'application/pdf') {
            createPDFAttachment(attachment.content, name);
          } else if (OFFICE_MIME_TYPES.includes(attachment.contentType)) {
            convertFromOffice(attachment.content, name);
          } else if (attachment.contentType.startsWith('image')) {
            let ext = attachment.filename.split('.')[1];
            convertImageToPDF(attachment.content, name, ext);
          }
        });
      }
    });
  });
};

const convertHTMLToPDF = (html, filename) => {
  const main = async () => {
    try {
      await PDFNet.HTML2PDF.setModulePath(
        path.resolve(__dirname, './node_modules/@pdftron/pdfnet-node/lib/')
      );
      const outputPath = path.resolve(__dirname, `./files/tmp/${filename}.pdf`);
      const html2pdf = await PDFNet.HTML2PDF.create();
      const pdfdoc = await PDFNet.PDFDoc.create();
      await html2pdf.insertFromHtmlString(html);
      await html2pdf.convert(pdfdoc);
      await pdfdoc.save(outputPath, PDFNet.SDFDoc.SaveOptions.e_linearized);
    } catch (err) {
      console.log(err);
    }
  };

  PDFNetEndpoint(main);
};

const createPDFAttachment = (buffer, filename) => {
  const main = async () => {
    try {
      const outputPath = path.resolve(__dirname, `./files/tmp/${filename}.pdf`);
      const pdfdoc = await PDFNet.PDFDoc.createFromBuffer(buffer);
      await pdfdoc.save(outputPath, PDFNet.SDFDoc.SaveOptions.e_linearized);
    } catch (err) {
      console.log(err);
    }
  };

  PDFNetEndpoint(main);
};

const convertFromOffice = (buffer, filename) => {
  const main = async () => {
    try {
      const outputPath = path.resolve(__dirname, `./files/tmp/${filename}.pdf`);
      const data = await PDFNet.Convert.office2PDFBuffer(buffer);
      const pdfdoc = await PDFNet.PDFDoc.createFromBuffer(data);
      await pdfdoc.save(outputPath, PDFNet.SDFDoc.SaveOptions.e_linearized);
    } catch (err) {
      console.log(err);
    }
  };

  PDFNetEndpoint(main);
};

const convertImageToPDF = async (buffer, filename, ext) => {
  const main = async () => {
    try {
      await fs.writeFile(
        path.resolve(__dirname, `./files/tmp/img/${filename}.${ext}`),
        buffer,
        (err) => {
          if (err) throw err;
        }
      );

      const inputPath = path.resolve(
        __dirname,
        `./files/tmp/img/${filename}.${ext}`
      );
      const outputPath = path.resolve(__dirname, `./files/tmp/${filename}.pdf`);

      const pdfdoc = await PDFNet.PDFDoc.create();
      await PDFNet.Convert.toPdf(pdfdoc, inputPath);
      await pdfdoc.save(outputPath, PDFNet.SDFDoc.SaveOptions.e_linearized);
      // delete temp image file
      fs.unlinkSync(
        path.resolve(__dirname, `./files/tmp/img/${filename}.${ext}`)
      );
    } catch (err) {
      console.log(err);
    }
  };

  PDFNetEndpoint(main);
};

const mergePDFs = () => {
  const directoryPath = path.resolve(__dirname, './files/tmp/');
  fs.readdir(directoryPath, { withFileTypes: true }, async (err, dirents) => {
    const main = async () => {
      if (err) {
        return console.log('Unable to scan directory: ' + err);
      }
      const newDoc = await PDFNet.PDFDoc.create();
      for (let i = 0; i < dirents.length; i++) {
        const dirent = dirents[i];
        if (dirent.isFile()) {
          const file = dirent.name;
          const extension = file.split('.')[1];
          if (extension === 'pdf') {
            const currDoc = await PDFNet.PDFDoc.createFromFilePath(
              path.resolve(__dirname, `./files/tmp/${file}`)
            );
            const currDocPageCount = await currDoc.getPageCount();
            const newDocPageCount = await newDoc.getPageCount();
            await newDoc.insertPages(
              newDocPageCount + 1,
              currDoc,
              1,
              currDocPageCount,
              PDFNet.PDFDoc.InsertFlag.e_none
            );
          }
        }
      }

      await newDoc.save(
        path.resolve(__dirname, `./files/converted.pdf`),
        PDFNet.SDFDoc.SaveOptions.e_linearized
      );
    };
    PDFNetEndpoint(main);
  });
};

const PDFNetEndpoint = (main) => {
  PDFNet.runWithCleanup(main) // you can add the key to PDFNet.runWithCleanup(main, process.env.PDFTRONKEY)
    .then(() => {
      PDFNet.shutdown();
    })
    .catch((err) => {
      console.log(err);
    });
};

convertEmailToPDF('./files/test3multiattach.eml');
// optionally after all emails have been converted you can call to merge them
setTimeout(mergePDFs, 5000);
// you can now clean up the files from the tmp location (leave the folder structure same for future conversions)
