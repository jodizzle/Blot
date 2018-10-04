var debug = require("debug")("clients:dropbox:download");
var dropboxStream = require("dropbox-stream");
var fs = require("fs-extra");
var tmpDir = require("helper").tempDir();
var join = require("path").join;
var uuid = require("uuid/v4");
var async = require("async");

function download(token, source, destination, callback) {
  var tmpLocation = join(tmpDir, uuid());

  var ws, down, metadata;

  try {
    ws = fs.createWriteStream(tmpLocation);
  } catch (err) {
    debug("Failed to create writeStream", err);
    return callback(err);
  }

  ws.on("finish", function() {
    fs.move(tmpLocation, destination, { overwrite: true }, function(err) {
      if (err) return callback(err);
      debug("Moved", tmpLocation, "to", destination);
      setMtime(destination, metadata.client_modified, callback);
    });
  }).on("error", callback);

  down = dropboxStream
    .createDropboxDownloadStream({
      token: token,

      filepath: source,

      chunkSize: 1000 * 1024,

      autorename: false
    })
    .on("progress", function(res) {
      debug("progress", res);
    })
    .on("metadata", function(res) {
      debug("metadata", res);
      metadata = res;
    })
    .on("error", callback)
    .pipe(ws);
}

function setMtime(path, modified, callback) {
  var mtime;

  try {
    mtime = new Date(modified);
  } catch (e) {
    return callback(e);
  }

  if (
    mtime === false ||
    mtime === null ||
    mtime === undefined ||
    !(mtime instanceof Date)
  ) {
    return callback(new Error("Download: setMtime: Could not create date"));
  }

  fs.utimes(path, mtime, mtime, function(err) {
    if (err) return callback(err);

    return callback(null);
  });
}

// try calling download 5 times with exponential backoff
// (i.e. intervals of 100, 200, 400, 800, 1600 milliseconds)
module.exports = function(token, source, destination, callback) {
  async.retry(
    {
      times: 5,
      interval: function(retryCount) {
        return 50 * Math.pow(2, retryCount);
      }
    },
    async.apply(download, token, source, destination),
    callback
  );
};
