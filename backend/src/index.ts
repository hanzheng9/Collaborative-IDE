import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

type CodeChangePayload = {
  workspaceId: string;
  fileId: string;
  code: string;
};

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT ?? 4000);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

io.on("connection", (socket) => {
  socket.on("join-workspace", (workspaceId: string) => {
    socket.join(workspaceId);
  });

  socket.on("code-change", (payload: CodeChangePayload) => {
    socket.to(payload.workspaceId).emit("code-change", {
      workspaceId: payload.workspaceId,
      fileId: payload.fileId,
      code: payload.code
    });
  });
});

server.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
