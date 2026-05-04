import React, { useRef, useState } from "react";
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import { Box, Button, Slider, Typography, CircularProgress, Paper, IconButton } from "@mui/material";
import { CloudUpload, Compress, Download } from "@mui/icons-material";
import { styled } from "@mui/material/styles";
import AnimationIcon from '@mui/icons-material/Animation'; // Just for playful feel

const Input = styled('input')({
  display: 'none',
});

const ffmpeg = createFFmpeg({ log: true });

const App = () => {
  const [file, setFile] = useState(null);
  const [output, setOutput] = useState(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [targetSize, setTargetSize] = useState(9); // MB default
  const [fileInfo, setFileInfo] = useState("");
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  // File selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFile(file);
    setOutput(null);
    if (file) {
      setFileInfo(`${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`);
    } else {
      setFileInfo("");
    }
  };

  // Compression logic
  const handleCompress = async () => {
    if (!file) return;
    setOutput(null);
    setLoading(true);
    setProgress(0);

    // Load ffmpeg core
    if (!ffmpeg.isLoaded()) await ffmpeg.load();

    // Write input file to FS
    ffmpeg.FS("writeFile", file.name, await fetchFile(file));

    // Estimate bitrate for target size
    const isVideo = file.type.startsWith("video");
    let duration = 1;
    try {
      duration = await getMediaDuration(file);
    } catch (e) { duration = 1; }

    const maxSizeBytes = targetSize * 1024 * 1024;

    // Bitrate in bits per second (allow 96% for output, rest for overhead)
    const targetBitrate = Math.floor((maxSizeBytes * 0.96 * 8) / duration);

    // Outfile/ext
    const outFile = isVideo ? "out.mp4" : "out.mp3";

    // ffmpeg args
    const args = isVideo
      ? [
          "-i", file.name,
          "-b:v", `${Math.floor(targetBitrate/1000)}k`,
          "-maxrate", `${Math.floor(targetBitrate/1000)}k`,
          "-bufsize", `${Math.floor(targetBitrate/500)}k`,
          "-c:v", "libx264", "-preset", "veryfast", "-movflags", "+faststart",
          "-c:a", "aac", "-b:a", "128k", // reasonable audio
          outFile
        ]
      : [
          "-i", file.name,
          "-b:a", `${Math.floor(targetBitrate/1000)}k`,
          "-acodec", "libmp3lame",
          outFile
        ];

    ffmpeg.setProgress(({ ratio }) => setProgress(ratio));

    try {
      await ffmpeg.run(...args);

      const data = ffmpeg.FS("readFile", outFile);
      const blob = new Blob([data.buffer], { type: isVideo ? "video/mp4" : "audio/mp3" });
      setOutput({ url: URL.createObjectURL(blob), name: outFile, type: blob.type });
    } catch (err) {
      alert("Compression failed. Try a smaller file or different type!");
    }
    setLoading(false);
    setProgress(0);

    // Cleanup
    ffmpeg.FS("unlink", file.name);
    try { ffmpeg.FS("unlink", outFile); } catch {}
  };

  // Utility: get media duration
  const getMediaDuration = (file) =>
    new Promise((resolve, reject) => {
      const media = document.createElement(file.type.startsWith("video") ? "video" : "audio");
      media.preload = "metadata";
      media.src = URL.createObjectURL(file);
      media.onloadedmetadata = () => {
        resolve(media.duration || 1);
        URL.revokeObjectURL(media.src);
      };
      media.onerror = reject;
    });

  // UI
  return (
    <Box
      minHeight="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      sx={{
        background: "linear-gradient(120deg, #2980b9, #6dd5fa, #dff6ff 90%)",
        transition: "background 0.5s",
      }}
    >
      <Paper
        elevation={12}
        sx={{
          display: "flex",
          flexDirection: "row",
          p: 4,
          background: "rgba(255,255,255,0.98)",
          borderRadius: 5,
          minWidth: 700,
          minHeight: 410,
          boxShadow: 30,
          overflow: "hidden"
        }}
      >

        {/* Left Side: Upload/Compress */}
        <Box sx={{ flex: 1, p: 2, display: "flex", flexDirection:"column", alignItems:"center", justifyContent: "center" }}>
          <AnimationIcon sx={{ fontSize: 54, color: "#2471A3", mb: 1, animation: "pulse 1.6s infinite" }} />
          <Typography variant="h5" fontWeight="bold" mb={1} color="primary">
            Media Compressor
          </Typography>
          <Typography color="text.secondary" mb={2}>
            Select any <b>video or audio</b> to compress and download instantly!
          </Typography>

          <label htmlFor="file-upload">
            <Input
              accept="audio/*,video/*"
              id="file-upload"
              type="file"
              onChange={handleFileChange}
            />
            <Button
              variant="contained"
              component="span"
              startIcon={<CloudUpload />}
              size="large"
              sx={{ mb: 2, fontWeight: "bold", bgcolor: "#5499C7", ":hover": {bgcolor: "#2471A3"} }}
            >
              Browse
            </Button>
          </label>
          <Typography variant="body2" sx={{ mb: 2, color: "#2874A6" }}>
            {fileInfo}
          </Typography>
          <Button
            variant="contained"
            color="secondary"
            endIcon={<Compress />}
            size="large"
            sx={{ fontWeight: "bold", bgcolor: "#D35400", ":hover": {bgcolor: "#BA4A00"} }}
            onClick={handleCompress}
            disabled={!file || loading}
          >
            {loading ? "Compressing..." : "Compress"}
          </Button>
          {loading && (
            <CircularProgress
              sx={{ mt: 4 }}
              variant="determinate"
              value={progress * 100}
              color="success"
            />
          )}
        </Box>

        {/* Right Side: Settings, Output */}
        <Box sx={{ flex: 1, p: 2, borderLeft: "2px solid #EBF5FB", display:"flex", flexDirection:"column", justifyContent:"center" }}>
          <Typography variant="body1" fontWeight="500" mb={1}>
            Target File Size:
          </Typography>
          <Typography>
            <Slider
              value={targetSize}
              min={2}
              max={50}
              step={0.5}
              onChange={(_, v) => setTargetSize(v)}
              valueLabelDisplay="auto"
              sx={{ width: 200, mt:2, mb:2 }}
              color="primary"
            /> 
            <b>{targetSize} MB</b>
          </Typography>
          <Typography variant="body2" mt={5} color="text.secondary">You can set any size between <b>2 MB</b> (smallest) and <b>50 MB</b>.</Typography>

          {output && (
            <Box mt={5} display="flex" flexDirection="column" alignItems="center">
              <Typography fontWeight="bold" mb={1}>Compressed Output:</Typography>
              {output.type.startsWith("video") && (
                <video src={output.url} controls width="220" style={{borderRadius:12,boxShadow:"0 2px 12px #d6eaf8"}} ref={videoRef}></video>
              )}
              {output.type.startsWith("audio") && (
                <audio src={output.url} controls ref={audioRef} style={{ width: 220, marginTop:10 }}></audio>
              )}
              <IconButton
                aria-label="Download"
                href={output.url}
                download={output.name || "compressed-file"}
                sx={{
                  mt: 2,
                  color: "#239B56",
                  background: "#EBF5FB",
                  transition: "all .22s", 
                  ":hover": { background: "#239B56", color: "#fff" }
                }}
              >
                <Download fontSize="large" />
              </IconButton>
              <Typography variant="body2">{output.name}</Typography>
            </Box>
          )}
        </Box>
      </Paper>
      {/* Fun animation keyframes */}
      <style>
        {`
        @keyframes pulse {
          0% { transform: scale(1);}
          50% {transform: scale(1.13);}
          100% { transform: scale(1);}
        }
        `}
      </style>
    </Box>
  );
};

export default App;
