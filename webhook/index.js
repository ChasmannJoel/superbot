import express from "express";
import fs from "fs";
import path from "path";

const app = express();
const PORT = 3060;
const DATA_FILE = path.join("./clientify_data.json");

// Middleware para leer JSON
app.use(express.json());

// Endpoint receptor del webhook
app.post("/webhook/clientify", (req, res) => {
  const data = req.body;

  console.log("📩 Webhook recibido desde Clientify:", data);

  try {
    // Leer el archivo existente o crear uno nuevo
    let registros = [];
    if (fs.existsSync(DATA_FILE)) {
      const fileData = fs.readFileSync(DATA_FILE, "utf8");
      if (fileData.trim() !== "") {
        registros = JSON.parse(fileData);
      }
    }

    // Agregar nuevo registro con marca de tiempo
    const entrada = {
      recibido_en: new Date().toISOString(),
      data,
    };

    registros.push(entrada);

    // Guardar actualizado
    fs.writeFileSync(DATA_FILE, JSON.stringify(registros, null, 2));

    console.log("✅ Registro guardado correctamente en clientify_data.json");

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Error guardando datos:", err);
    res.status(500).send("Error al guardar");
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Webhook API escuchando en http://localhost:${PORT}`);
});
