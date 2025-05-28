const axios = require('axios');
const fs = require('fs');
const cheerio = require('cheerio');

async function downloadHtml(url, filename) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // Select the two specific tables
        const tables = $('table').slice(0, 2);

        // Create a new HTML structure with only the selected tables
        const filteredHtml = $('<div>');
        let idCounter = 1;

        tables.each((index, table) => {
            const $table = $(table);
            $table.find('*').each((i, element) => {
                $(element).attr('id', `element-${idCounter++}`);
            });
            filteredHtml.append($table);
        });

        // Write the filtered HTML to a file
        fs.writeFileSync(filename, filteredHtml.html(), 'utf-8');

        // Now read the downloaded file to extract values
        const fileContent = fs.readFileSync(filename, 'utf-8');
        const $file = cheerio.load(fileContent);

        // Extract values using the correct element IDs
        const payer = $file('#element-40').text().trim();
        const payerAccount = $file('#element-43').text().trim();
        const receiver = $file('#element-58').text().trim();
        const receiverAccount = $file('#element-61').text().trim();
        const paymentDate = $file('#element-79').text().trim();
        const reference = $file('#element-78').text().trim();
        const transferredAmount = $file('#element-80').text().trim();

        // Parse the payment date
        let formattedDate = null;
        if (paymentDate) {
            const [datePart, timePart] = paymentDate.split(' ');
            const [day, month, year] = datePart.split('-');
            formattedDate = new Date(`${year}-${month}-${day}T${timePart}`).toISOString();
        }

        // Parse the transferred amount
        const amount = transferredAmount ? parseFloat(transferredAmount.split(' ')[0]) : 0;

        // Create the result object
        const result = {
            payer: payer,
            payerAccount: payerAccount,
            receiver: receiver,
            receiverAccount: receiverAccount,
            paymentDate: formattedDate,
            reference: reference,
            transferredAmount: amount
        };

        // Clean up the temporary file
        try {
            fs.unlinkSync(filename);
        } catch (error) {
            console.error('Error deleting temporary file:', error);
        }

        return result;

    } catch (error) {
        console.error(`An error occurred: ${error}`);
        throw error;
    }
}

module.exports = {
    downloadHtml
}; 
