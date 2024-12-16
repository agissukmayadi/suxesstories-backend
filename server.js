const express = require("express");
const axios = require("axios");
const { Firestore } = require("@google-cloud/firestore");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const midtransClient = require("midtrans-client");
const nodemailer = require("nodemailer");

// Path ke file kunci service account
const serviceAccountPath = path.join(
  __dirname,
  "suxesstories-3ee3d-firebase-adminsdk-ik072-bf61d5dd81.json"
);

// Inisialisasi Firestore dengan kunci service account
const db = new Firestore({
  keyFilename: serviceAccountPath,
});

// Midtrans Configuration
const snap = new midtransClient.Snap({
  isProduction: false, // Set to true for production
  serverKey: "SB-Mid-server-YQSw2xsUVQZ2LjjYdkGmJheg",
  clientKey: "SB-Mid-client-sRg-V9GHxs9nPSzb",
});

// Nodemailer Configuration
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "no-reply@suxesstories.com",
    pass: "Terbang9898!?#",
  },
  logger: true, // Log aktivitas
  debug: true,  // Aktifkan debug mode
});

const app = express();
app.use(bodyParser.json());
// Middleware CORS
app.use(
  cors({
    origin: "http://localhost:5173", // Izinkan hanya frontend Anda
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.get("/", (req, res) => {
  res.send(
    "Server berjalan. Gunakan endpoint /api/fetch-surveys untuk mengambil survei."
  );
});

// Konfigurasi LimeSurvey
const limeSurveyConfig = {
  baseURL: "https://test.suxesstories.com",
  username: "intern",
  password: "Surabaya2024!?#",
};

// Fungsi untuk mendapatkan session key dari LimeSurvey
async function getSessionKey() {
  const response = await axios.post(
    `${limeSurveyConfig.baseURL}/admin/remotecontrol`,
    {
      method: "get_session_key",
      params: [limeSurveyConfig.username, limeSurveyConfig.password],
      id: 1,
    }
  );
  return response.data.result;
}

// Fungsi untuk melepaskan session key dari LimeSurvey
async function releaseSessionKey(sessionKey) {
  await axios.post(`${limeSurveyConfig.baseURL}/admin/relIxzAEvIBPRgtaFmotecontrol`, {
    method: "release_session_key",
    params: [sessionKey],
    id: 3,
  });
}

async function assignSurveys(sessionKey, surveys, participant) {
  const tokens = {};

  for (const survey of surveys) {
    const participantData = [
      {
        firstname: participant.name,
        email: participant.email,
      },
    ];

    const response = await axios.post(
      `${limeSurveyConfig.baseURL}/admin/remotecontrol`,
      {
        method: "add_participants",
        params: [sessionKey, survey.idSurvey, participantData, true],
        id: 4,
      }
    );

    const surveyToken = response.data.result.map((data) => data.token)[0];
    tokens[survey.idSurvey] = surveyToken;
  }

  return tokens; // Kembalikan objek dengan surveyId dan token-nya
}

// Endpoint untuk mengambil dan menyimpan survei dari LimeSurvey
app.post("/api/fetch-surveys", async (req, res) => {
  let sessionKey;
  try {
    // 1. Dapatkan session key dari LimeSurvey
    sessionKey = await getSessionKey();
    if (!sessionKey) {
      throw new Error("Gagal mendapatkan session key dari LimeSurvey");
    }
    console.log("Session key:", sessionKey);

    // 2. Ambil daftar survei
    const surveysResponse = await axios.post(
      `${limeSurveyConfig.baseURL}/admin/remotecontrol`,
      {
        method: "list_surveys",
        params: [sessionKey],
        id: 2,
      }
    );

    const surveys = surveysResponse.data.result;

    if (!surveys || surveys.length === 0) {
      console.log("Tidak ada survei ditemukan.");
      return res.status(404).json({ message: "Tidak ada survei ditemukan." });
    }

    // 3. Filter survei aktif
    const activeSurveys = surveys.filter((survey) => survey.active === "Y");
    console.log("Survei aktif ditemukan:", activeSurveys);

    // 4. Simpan survei ke Firestore
    const testsCollection = db.collection("tests");
    const savedSurveys = [];

    for (const survey of activeSurveys) {
      const newTestRef = testsCollection.doc(survey.sid);
      const testDoc = await newTestRef.get();

      if (!testDoc.exists) {
        await newTestRef.set({
          idSurvey: survey.sid,
          title: survey.surveyls_title,
          description: survey.surveyls_description || "",
          active: true,
        });

        savedSurveys.push({
          idSurvey: survey.sid,
          title: survey.surveyls_title,
        });

        console.log(`Tes aktif disimpan: ${survey.surveyls_title}`);
      } else {
        console.log(`Tes sudah ada: ${survey.surveyls_title}`);
      }
    }

    // Kirim respons sukses
    res.status(200).json({
      message: "Survei aktif berhasil disimpan.",
      savedSurveys,
    });
  } catch (error) {
    console.error("Error fetching surveys from LimeSurvey:", error);
    res.status(500).json({
      message: "Gagal mengambil survei dari LimeSurvey.",
      error: error.message,
    });
  } finally {
    // Lepaskan session key jika sudah diambil
    if (sessionKey) {
      await releaseSessionKey(sessionKey);
      console.log("Session key berhasil dilepaskan");
    }
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

app.post("/api/assign-survey", async (req, res) => {
  const { eventName, participant, surveys } = req.body;
  let sessionKey;

  try {
    sessionKey = await getSessionKey();

    // Assign token untuk setiap survei
    const tokens = await assignSurveys(sessionKey, surveys, participant);
    console.log(tokens);
    // Buat daftar tautan survei
    let surveyLinks = "";
    surveys.forEach((survey) => {
      surveyLinks += `
        <li>
          <strong>${survey.title}:</strong> 
          <a href="https://test.suxesstories.com/index.php/${
            survey.idSurvey
          }?token=${tokens[survey.idSurvey]}">
            Start Survey
          </a>
        </li>`;
    });

    // Kirim email ke peserta
    const mailOptions = {
      from: '"Survey Team" <no-reply@suxesstories.com>',
      to: participant.email,
      subject: `Your Surveys for ${eventName}`,
      html: `
        <h1>Hi ${participant.name},</h1>
        <p>You have been assigned to the following surveys for the event <strong>${eventName}</strong>:</p>
        <ul>${surveyLinks}</ul>
      `,
    };
    await transporter.sendMail(mailOptions);

    res
      .status(200)
      .json({ message: "Participant assigned and email sent.", tokens });
  } catch (error) {
    console.error("Error assigning surveys:", error);
    res
      .status(500)
      .json({ message: "Failed to assign surveys.", error: error.message });
  } finally {
    if (sessionKey) {
      await releaseSessionKey(sessionKey);
    }
  }
});

// app.post("/api/get-survey-results", async (req, res) => {
//   const { surveyId, format, token } = req.body; // Dapatkan surveyId dan token dari request frontend
//   let sessionKey;

//   try {
//     // 1. Dapatkan session key
//     sessionKey = await getSessionKey();

//     // 2. Ekspor hasil survei menggunakan LimeSurvey API
//     const response = await axios.post(
//       `${limeSurveyConfig.baseURL}/admin/remotecontrol`,
//       {
//         method: "export_responses",
//         params: [
//           sessionKey,
//           surveyId,
//           format || "pdf", // Format file: pdf, csv, atau excel
//           { token: token, completionstate: "complete" }, // Filter berdasarkan token
//         ],
//         id: 5,
//       }
//     );

//     const fileData = response.data.result; // Data hasil survei yang sudah diekspor dalam bentuk base64
//     if (!fileData) throw new Error("Gagal mendapatkan hasil survei.");

//     // 3. Kirim file sebagai respons
//     const buffer = Buffer.from(fileData, "base64"); // Konversi base64 ke binary
//     const fileName = `survey_result_${surveyId}.pdf`; // Nama file yang dikirim

//     res.set({
//       "Content-Type": "application/pdf",
//       "Content-Disposition": `attachment; filename=${fileName}`,
//       "Content-Length": buffer.length,
//     });
//     res.send(buffer);
//   } catch (error) {
//     console.error("Error fetching survey results:", error);
//     res.status(500).json({ message: "Gagal mendapatkan hasil survei." });
//   } finally {
//     if (sessionKey) {
//       await releaseSessionKey(sessionKey);
//     }
//   }
// });


// Jalankan server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
