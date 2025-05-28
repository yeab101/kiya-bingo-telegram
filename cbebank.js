const https = require('https'); 

// Private utility functions
const getPdfReader = async () => {
    const { readPdfText } = await import('pdf-text-reader');
    return readPdfText;
}; 

const downloadPdf = async (txId) => {
    return new Promise((resolve, reject) => { 
        https.get(`${txId}`, { rejectUnauthorized: false }, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error('Invalid transaction ID'));
            }

            const data = [];
            res.on('data', (chunk) => data.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(data);
                // if (buffer.length < 100) {
                //     return reject(new Error('took too long to respond try again later'));
                // }
                resolve(buffer);
            });
        }).on('error', () => reject(new Error('error processing transaction please try again later')));
    });
};

const extractValue = (regex, txt) => {
    const match = regex.exec(txt);
    return match?.groups?.['value'];
};

const processResultText = (text) => {
    const payer = extractValue(/Payer\s+(?<value>[A-Z\s]+)/, text)?.trim().slice(0, -3);
    const payerAccount = Number(extractValue(/Payer [A-Z\s]+\nAccount (?<value>1\*{4}\d{4})\n/, text)?.slice(-4));
    const receiver = extractValue(/Receiver\s+(?<value>[A-Z\s]+)/, text)?.trim().slice(0, -3);
    const receiverAccount = Number(extractValue(/Receiver [A-Z\s]+\nAccount (?<value>1\*{4}\d{4})\n/, text)?.slice(-4));
    const reference = extractValue(/Reference No\. \(VAT Invoice No\)\s+(?<value>FT\w{10})/, text);
    const paymentDateRaw = extractValue(/Payment Date & Time\s+(?<value>[0-9\/]+,\s+[0-9:]+\s+[APM]{2})/, text)?.trim();
    const transferredAmount = extractValue(/Transferred Amount\s+(?<value>[\d,]+\.\d+) ETB/, text);

    return {
        payer,
        payerAccount,
        receiver,
        receiverAccount,
        paymentDate: paymentDateRaw ? new Date(paymentDateRaw).toISOString() : null,
        reference,
        transferredAmount: transferredAmount ? Number.parseFloat(transferredAmount.replace(",", "")) : undefined,
    };
};

// Single exported function
const verifyBankTransaction = async (url) => {
    try {
        const pdfData = await downloadPdf(url);
        const readPdfText = await getPdfReader();
        const pdfText = await readPdfText({ data: new Uint8Array(pdfData) });
        const result = processResultText(pdfText);
        return result;
    } catch (error) {
        throw new Error(`Transaction verification failed: ${error.message}`);
    }
};
 
module.exports = verifyBankTransaction; 