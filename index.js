const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const midtransClient = require("midtrans-client");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Midtrans Configuration
const snap = new midtransClient.Snap({
  isProduction: false, // Set to true for production
  serverKey: "SB-Mid-server-YQSw2xsUVQZ2LjjYdkGmJheg",
  clientKey: "SB-Mid-client-sRg-V9GHxs9nPSzb",
});

// Nodemailer Configuration
const transporter = nodemailer.createTransport({
  service: "gmail", // Sesuaikan dengan layanan email Anda (e.g., Gmail, Outlook)
  auth: {
    user: "agissukmayadi009@gmail.com", // Ganti dengan email pengirim Anda
    pass: "zzln txdx vvdh kkdn", // Ganti dengan password atau App Password Anda
  },
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/api/email-event", async (req, res) => {
  const { email, tests, name } = req.body;

  try {
    // Konfigurasi email
    const mailOptions = {
      from: '"Event Organizer" <your-email@gmail.com>', // Pengirim
      to: email, // Penerima
      subject: "Event Registration Confirmation", // Subjek
      html: `
        <h1>Hi ${name},</h1>
        <p>Thank you for registering for the event.</p>
        <p>Here are your test details:</p>
        <ul>
          ${tests
            .map((test) => `<li>${test.title} : ${test.link}</li>`)
            .join("")}
        </ul>
        <p>We look forward to seeing you at the event!</p>
      `, // Konten email dalam format HTML
    };

    // Kirim email
    await transporter.sendMail(mailOptions);

    return res.json({ message: "Email sent successfully" });
  } catch (error) {
    console.error("Error sending email:", error);
    return res.status(500).json({
      message: error.message,
    });
  }
});

app.post("/api/assign-event", async (req, res) => {
  const { event, form, tests } = req.body;

  try {
    // Jika pembayaran tidak dibutuhkan
    if (!event.payment) {
      return res.json({ message: "Registered Success" });
    }

    // Jika membutuhkan pembayaran, buat transaksi Midtrans
    const orderId = `EVENT-${event.id}-${Date.now()}`; // Unik setiap transaksi
    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: parseInt(event.amount), // Pastikan integer
      },
      customer_details: {
        first_name: form.name,
        email: form.email,
      },
      item_details: [
        {
          id: event.id,
          price: parseInt(event.amount), // Harga harus integer
          quantity: 1,
          name: event.name,
        },
      ],
    };

    // Buat transaksi di Midtrans
    const transaction = await snap.createTransaction(parameter);

    // Kirim token pembayaran ke frontend
    return res.json({
      paymentToken: transaction.token,
      orderId,
    });
  } catch (error) {
    console.error("Error creating transaction:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Start Server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});