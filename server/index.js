// require("dotenv").config(); //===note: If running code locally, please uncomment this line.
const AWS = require("aws-sdk");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");

// ==== configure AWS
AWS.config.update({
  // note:  If running code locally, please uncomment these 3 lines below.
  // accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  // secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  // sessionToken: process.env.AWS_SESSION_TOKEN,
  region: "ap-southeast-2",
});

//==== create instances for SQS and S3
const s3 = new AWS.S3(); //Create an S3 client
const sqs = new AWS.SQS({ apiVersion: "2012-11-05" }); // create SQS

//==== define SQS queue URL and S3 bucket name
const queueUrl = "https://sqs.ap-southeast-2.amazonaws.com/****/****-sqs-****";
// ==== bucket for client to store original videos
const bucketStorageForClientUpload = "****-s3-client";
// ==== bucket for server side to store processed videos
const bucketStorageForServerUpload = "****-s3-server";

//==== create AWS DynamoDB service
const dynamoDB = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
const myTableName = "****-****-db";
const qutUserName = "****@qut.edu.au";

//==== Function to call DynamoDB to add the item to the table
function putItemDynamoDB(userId, videoKey) {
  const params = {
    TableName: myTableName,
    Item: {
      qut_user: {
        S: qutUserName,
      },
      client_user_id: {
        S: userId,
      },
      s3_videoKey: {
        S: videoKey,
      },
    },
  };

  //==== Call DynamoDB to add the item to the table
  dynamoDB.putItem(params, function (err, data) {
    if (err) {
      console.log("Error", err);
    } else {
      console.log("Put processed info into dynamoDB successfully.");
    }
  });
}

//==== Function to create a temporary file from a video buffer
function createTemporaryFile(videoBuffer) {
  const randomString = Math.random().toString(36).substring(7);
  const timestamp = Date.now();
  const tmpFileName = `temp_${timestamp}_${randomString}.mp4`;
  fs.writeFileSync(tmpFileName, videoBuffer);
  return tmpFileName;
}

function createRandomName() {
  const randomString = Math.random().toString(36).substring(7);
  const timestamp = Date.now();
  const tmpFileName = `temp_${timestamp}_${randomString}.mp4`;
  return tmpFileName;
}

//===Function to process a single video from a file
function processVideo(userId, videoKey, xPixel, yPixel, inputFile) {
  return new Promise((resolve, reject) => {
    // FFmpeg processing options
    const outputFile = createRandomName();
    const mySize = `${xPixel}x${yPixel}`;

    ffmpeg()
      .input(inputFile)
      // Add your FFmpeg processing options here
      .output(outputFile)
      .audioCodec("aac") // Set audio codec
      .videoCodec("libx264") // Set video codec
      .size(mySize)
      .on("end", () => {
        console.log("Video processing complete.");

        //==== Upload the processed video back to S3
        const uploadParams = {
          Bucket: bucketStorageForServerUpload,
          Key: videoKey,
          Body: fs.createReadStream(outputFile),
        };

        s3.upload(uploadParams, (err, data) => {
          if (err) {
            console.error("Error uploading processed video:", err);
            reject(err);
          } else {
            //=== send processed video's info like key and user id to dynamoDB
            putItemDynamoDB(userId, videoKey);
            console.log("Uploading processed video to S3 complete.", videoKey);

            //===Clean up temporary files
            fs.unlinkSync(inputFile);
            fs.unlinkSync(outputFile);
            resolve();
          }
        });
      })
      .on("error", (err) => {
        console.error("Error processing video:", err);
        reject(err);
      })
      .run();
  });
}

//==== Function to poll SQS and process messages
async function pollAndProcessMessages() {
  //==== try to retrieve the message from SQS
  try {
    const paramsSQS = {
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1, // Process one message at a time
    };

    //==== get the message data
    const data = await sqs.receiveMessage(paramsSQS).promise();

    //==== check whether the SQS message is null or not
    if (data.Messages && data.Messages.length > 0) {
      const message = data.Messages[0];

      //==== Process the video specified in the message
      const { userId, videoKey, xPixel, yPixel } = JSON.parse(message.Body);

      //==== get the video from s3
      const videoData = await s3
        .getObject({
          Bucket: bucketStorageForClientUpload,
          Key: videoKey,
        })
        .promise();

      const videoBuffer = videoData.Body; // video data
      //==== convert video data buffer to video file for ffmpeg to process
      const inputFile = createTemporaryFile(videoBuffer);

      // ==== invoke process video function
      await processVideo(userId, videoKey, xPixel, yPixel, inputFile);

      // ==== delete the processed message from the SQS queue
      await sqs
        .deleteMessage({
          QueueUrl: queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        })
        .promise();
    } else {
      //==== no message in SQS
      console.log("No messages in SQS queue.");
    }
  } catch (err) {
    console.error("Error polling or processing messages:", err);
  }
}

//==== poll SQS queue every 'pollInterval' seconds
const pollInterval = 35;
pollAndProcessMessages();
setInterval(() => {
  pollAndProcessMessages();
}, pollInterval * 1000);
