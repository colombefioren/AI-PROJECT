import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import { GoogleGenAI } from "@google/genai";
dotenv.config();

const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY || "-");
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    temperature: 0.6,
    maxOutputTokens: 1000,
  },
});

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "kgG7dCoKCfLehAPWkJOE";

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);
  await execCommand(
    `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`
  );
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);
  await execCommand(
    `./bin/rhubarb -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic`
  );
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "Hey dear... How was your day?",
          audio: await audioFileToBase64("audios/intro_0.wav"),
          lipsync: await readJsonTranscript("audios/intro_0.json"),
          facialExpression: "smile",
          animation: "Talking_1",
        },
        {
          text: "I missed you so much... Please don't go for so long!",
          audio: await audioFileToBase64("audios/intro_1.wav"),
          lipsync: await readJsonTranscript("audios/intro_1.json"),
          facialExpression: "sad",
          animation: "Crying",
        },
      ],
    });
    return;
  }

  if (!elevenLabsApiKey || !process.env.GEMINI_API_KEY) {
    res.send({
      messages: [
        {
          text: "Please my dear, don't forget to add your API keys!",
          audio: await audioFileToBase64("audios/api_0.wav"),
          lipsync: await readJsonTranscript("audios/api_0.json"),
          facialExpression: "angry",
          animation: "Angry",
        },
        {
          text: "You don't want to ruin Wawa Sensei with a crazy Gemini and ElevenLabs bill, right?",
          audio: await audioFileToBase64("audios/api_1.wav"),
          lipsync: await readJsonTranscript("audios/api_1.json"),
          facialExpression: "smile",
          animation: "Laughing",
        },
      ],
    });
    return;
  }

  try {
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [
            {
              text: "You are a virtual girlfriend. Always respond with a JSON array of messages (max 3). Each message should have text, facialExpression, and animation properties.",
            },
          ],
        },
        {
          role: "model",
          parts: [
            {
              text: "Understood! I'll respond with properly formatted JSON containing virtual girlfriend messages.",
            },
          ],
        },
      ],
    });

    const prompt = `Create response for: ${userMessage}. 
      Respond with JSON array format like this:
      [{
        "text": "message text",
        "facialExpression": "smile|sad|angry|surprised|funnyFace|default",
        "animation": "Talking_0|Talking_1|Talking_2|Crying|Laughing|Rumba|Idle|Terrified|Angry"
      }]`;

    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    const text = response.text();

    let messages;
    try {
      messages = JSON.parse(text);
      if (!Array.isArray(messages)) {
        messages = [
          {
            text: text,
            facialExpression: "smile",
            animation: "Talking_1",
          },
        ];
      }
    } catch (e) {
      console.error("JSON parse error:", e);
      messages = [
        {
          text: text,
          facialExpression: "smile",
          animation: "Talking_1",
        },
      ];
    }

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const fileName = `audios/message_${i}.mp3`;
      await voice.textToSpeech(
        elevenLabsApiKey,
        voiceID,
        fileName,
        message.text
      );
      await lipSyncMessage(i);
      message.audio = await audioFileToBase64(fileName);
      message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
    }

    res.send({ messages });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send({
      messages: [
        {
          text: "Sorry, I encountered an error. Please try again.",
          facialExpression: "sad",
          animation: "Idle",
        },
      ],
    });
  }
});

app.listen(port, () => {
  console.log(`Your virtual assistant is listening on port ${port}`);
});
