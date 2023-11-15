//==== configure AWS==================================
AWS.config.update({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  sessionToken: AWS_SESSION_TOKEN,
  region: "ap-southeast-2",
});

//==== create AWS AWS S3 service
const s3 = new AWS.S3();
//==== bucket for client to store original videos
const s3BucketNameUpload = "****-s3-client";
//==== bucket for server side to store processed videos
const s3BucketNameDownload = "****-s3-server";

//==== create AWS SQS service
const sqs = new AWS.SQS({ apiVersion: "2012-11-05" });
const queueURL = "https://sqs.ap-southeast-2.amazonaws.com/****/****-sqs-****";

//==== create AWS DynamoDB service
const dynamoDB = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
const myTableName = "****-****-db";
const qutUserName = "****@qut.edu.au";

//==== dot display the uploading information
document.getElementById("spinner-video-uploading").style.display = "none";
document.getElementById("video-uploading").style.display = "none";
document.getElementById("video-player").style.display = "none";

// ==== user information is deleted from DB every time the page is refreshed
deleteUserInfoFromDB();

//==== create a UUID user if this is no user id
let userInformation; //=== use global variable to store user information
const checkUser = JSON.parse(localStorage.getItem("userRezieVideoApp")); //get the local storage content

//==== check whether the local storage has the information of the user
if (checkUser) {
  userInformation = checkUser;
  // ==== update the attribute of the object
  checkUser.video_key = "null";
  //==== save the updated object back to Local Storage
  localStorage.setItem("userRezieVideoApp", JSON.stringify(checkUser));
} else {
  const userUUId = uuidv4();
  const userInfo = {
    user_id: userUUId,
    video_key: "null",
  };
  //==== store the user information in the local storage
  localStorage.setItem("userRezieVideoApp", JSON.stringify(userInfo));
  //==== get the information from the local storage,
  // and then set up the global variable:userInformation
  userInformation = JSON.parse(localStorage.getItem("userRezieVideoApp"));
}

//==== display the user id the html
document.getElementById("user-uuid").textContent = userInformation?.user_id;

//==== upload video to S3 and send message to SQS
document
  .getElementById("uploadForm_single_video")
  .addEventListener("submit", function (e) {
    e.preventDefault();

    //==== get input video
    const fileInput = document.getElementById("fileInput-video");
    //==== get the first file
    const file = fileInput.files[0];
    //==== check whether the file exits
    if (!file) {
      alert("Please select a file to upload.");
      return;
    }

    //==== get the input element by its id
    const xPixel = document.getElementById("x-pixel").value;
    const yPixel = document.getElementById("y-pixel").value;

    //==== upload the processed image to AWS s3
    const myKey = `${userInformation?.user_id}-${xPixel}-${yPixel}-${file.name}`;

    //==== display the uploading information
    document.getElementById("spinner-video-uploading").style.display = "block";
    document.getElementById("video-uploading").style.display = "block";

    //==== parameters for AWS S3
    const paramsUpload = {
      Bucket: s3BucketNameUpload,
      Key: myKey,
      Body: file,
      ContentType: "video", // Adjust the content type based on your image format
    };
    //==== upload a file to S3
    s3.upload(paramsUpload, (err, data) => {
      if (err) {
        console.error("Error uploading file:", err);
      } else {
        //==== do not display the uploading information
        document.getElementById("spinner-video-uploading").style.display =
          "none";
        document.getElementById("video-uploading").style.display = "none";

        //=====================================================================
        // ==== send message to SQS
        // After uploading, send a request to the SQS queue for image processing
        const messageObject = {
          userId: userInformation?.user_id,
          videoKey: myKey,
          xPixel: xPixel,
          yPixel: yPixel,
        };

        //==== convert JSON to string for SQS message body
        const messageBody = JSON.stringify(messageObject);

        //==== when upload a file to S3, then send a message to SQS
        const paramsSQS = {
          QueueUrl: queueURL,
          MessageBody: messageBody,
        };

        sqs.sendMessage(paramsSQS, (err, data) => {
          if (err) {
            console.error("Error sending message to SQS:", err);
          } else {
            console.log("Message sent to SQS:", data);
            //==== display the name of the video
            displayVideoName(myKey);
          }
        }); //end of SQS function
      }
    }); //end of S3 upload function
    // ==============================
  });

//==== display video file name
function displayVideoName(videoKey) {
  // ====Retrieve the object from Local Storage
  const storedData = JSON.parse(localStorage.getItem("userRezieVideoApp"));
  if (storedData) {
    // ====Update the attribute of the object
    storedData.video_key = videoKey;
    // ===Save the updated object back to Local Storage
    localStorage.setItem("userRezieVideoApp", JSON.stringify(storedData));
    const getUser = JSON.parse(localStorage.getItem("userRezieVideoApp"));
  }

  // ====display video file information in html
  const fileNameDisplay = document.getElementById("video-name");
  const uploadCompletedFlag = document.getElementById("upload-complete-flag");

  // ====display the upload Completed Flag
  uploadCompletedFlag.textContent = "Upload completed.";
  // ====display the vide file name (=key stored in S3)
  fileNameDisplay.textContent = `Video Name: ${videoKey}`;
}

// ===get video size and its dimensions
// Get the file input element, elements to display size and dimensions, and the video element
const videoInput = document.getElementById("fileInput-video");
const videoSizeElement = document.getElementById("video-size");
const videoDimensionsElement = document.getElementById("video-dimensions");
const videoElement = document.getElementById("videoElement");

// Add an event listener to the video input to detect changes
videoInput.addEventListener("change", function () {
  // Check if a video file has been selected
  if (videoInput.files.length > 0) {
    const selectedVideo = videoInput.files[0]; // Get the first selected video file
    const videoSize = selectedVideo.size; // Get the size of the video in bytes
    const fileSizeInKilobytes = videoSize / 1024;
    const fileSizeInMegabytes = fileSizeInKilobytes / 1024;
    // ====display the vide file size
    videoSizeElement.textContent = `Video size: ${fileSizeInMegabytes.toFixed(
      2
    )} MB`;

    //=== load the video into the hidden video element to get its dimensions
    videoElement.src = URL.createObjectURL(selectedVideo);
    videoElement.addEventListener("loadedmetadata", function () {
      const videoWidth = videoElement.videoWidth; // Get video width in pixels
      const videoHeight = videoElement.videoHeight; // Get video height in pixels
      videoDimensionsElement.textContent =
        "Video Dimensions: " + videoWidth + "x" + videoHeight + " pixels";
      videoElement.style.display = "none";
    });
  } else {
    videoSizeElement.textContent = "Not selected";
    videoDimensionsElement.textContent = "Not selected";
  }
});

//==== delete the user's video info from DynamoDB after the user downloads the video
function deleteUserInfoFromDB() {
  //=== retrieve the user id from local Storage
  const storedData_userId = JSON.parse(
    localStorage.getItem("userRezieVideoApp")
  )?.user_id;

  const paramsDelete = {
    TableName: myTableName,
    Key: {
      qut_user: {
        S: qutUserName,
      },
      client_user_id: {
        S: storedData_userId,
      },
    },
  };

  if (storedData_userId) {
    dynamoDB.deleteItem(paramsDelete, (error, data) => {
      if (error) {
        console.error("Error:", error);
      } else {
        console.log("Delete user's video info form DB successfully.");
      }
    }); // end of deleteItem
  }
}

//==== get video from AWS s3 and display it in html
function getProcessedVideoFromS3(videKey) {
  //===display the video element
  document.getElementById("video-player").style.display = "block";

  const paramsDownload = {
    Bucket: s3BucketNameDownload,
    Key: videKey,
    Expires: 3600,
  };

  // === video container
  const videoPlayer = document.getElementById("video-player");
  const downloadLink = document.getElementById("download-link");

  //=== create a video element
  const videoElement = document.createElement("video");
  videoElement.controls = true;

  //=== get the video URL from S3
  const videoURL = s3.getSignedUrl("getObject", paramsDownload);
  videoElement.src = videoURL;
  videoPlayer.src = videoURL;

  //=== apply CSS to limit the size of the video
  videoElement.style.maxWidth = "100%"; // Set a maximum width
  videoElement.style.maxHeight = "100%"; // Set a maximum height

  //=== set up download link
  downloadLink.href = videoURL;
}

//==== continue to get the video from DynamoDB by polling until the video is obtained
async function getVideoWithPollingFromDynamoDB() {
  //=== retrieve the user id from local Storage
  const storedData_userId = JSON.parse(
    localStorage.getItem("userRezieVideoApp")
  )?.user_id;

  //=== get item from DynamoDB
  const paramsDynamoDB = {
    TableName: myTableName,
    Key: {
      qut_user: {
        S: qutUserName,
      },
      client_user_id: {
        S: storedData_userId,
      },
    },
    ProjectionExpression: "s3_videoKey",
  };

  //==== check if the user's video is in DynamoDB
  try {
    // ==== get user's info from dynamoDB
    const data = await dynamoDB.getItem(paramsDynamoDB).promise();
    // ==== get the video's S3 key
    const video_Key = data.Item?.s3_videoKey?.S;

    // ==== get the video via S3 key and display the video
    getProcessedVideoFromS3(video_Key);
  } catch (error) {
    //===do not display the video processed flag
    document.getElementById("video-processed-flag").style.display = "none";

    //===hide the video element
    document.getElementById("video-player").style.display = "none";
    console.error("Error retrieving item:", error.message);
  }
}

// === poll video from DynamoDB every 'pollInterval' seconds
const pollInterval = 3;
getVideoWithPollingFromDynamoDB();
setInterval(() => {
  getVideoWithPollingFromDynamoDB();
}, pollInterval * 1000);
