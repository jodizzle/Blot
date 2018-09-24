describe("sync", function() {
  beforeEach(require("./util/setupUser"));

  var waitForSyncToFinish = require("./util/waitForSyncToFinish");
  var localPath = require("helper").localPath;
  var pushAllChanges = require("./util/pushAllChanges");
  var fs = require("fs-extra");
  var checkPostExists = require("./util/checkPostExists");
  var sync = require("../sync");

  // if two files are pushed, and one produces an error when calling
  // set() the other should sync just fine.
  xit("should sync good changes even if one produces a sync error", function(done) {});

  // pretty basic
  it("should sync an updated file", function(done) {
    var path = "/Hello world.txt";
    var content = "Hello, World!";
    var contentChanged = "New, World!";

    fs.outputFileSync(global.usersGitDirectory + path, content);

    pushAllChanges(global.usersGitClient, function(err) {
      expect(err).toEqual(null);

      waitForSyncToFinish(function(err) {
        expect(err).toEqual(null);

        checkPostExists(path, { title: content }, function(err) {
          expect(err).toEqual(null);

          fs.outputFileSync(global.usersGitDirectory + path, contentChanged);

          pushAllChanges(global.usersGitClient, function(err) {
            expect(err).toEqual(null);

            waitForSyncToFinish(function(err) {
              expect(err).toEqual(null);

              checkPostExists(path, { title: contentChanged }, function(err) {
                expect(err).toEqual(null);
                expect(
                  fs.readFileSync(localPath(global.blog.id, path), "utf-8")
                ).toEqual(contentChanged);
                done();
              });
            });
          });
        });
      });
    });
  });

  // commit -> commit -> push etc...
  it("should process multiple unsynced commits properly", function(done) {
    var firstPath = "/Hello world.txt";
    var firstContent = "Hello, World!";

    var secondPath = "/New world.txt";
    var secondContent = "New, World!";

    fs.outputFileSync(global.usersGitDirectory + firstPath, firstContent);

    global.usersGitClient.add('.', function(err){

      expect(err).toEqual(null);
      
      global.usersGitClient.commit("Added first path", function(err){

        expect(err).toEqual(null);

        fs.outputFileSync(global.usersGitDirectory + secondPath, secondContent);

        pushAllChanges(global.usersGitClient, function(err) {
          expect(err).toEqual(null);

          waitForSyncToFinish(function(err) {
            expect(err).toEqual(null);

            checkPostExists(firstPath, function(err) {
              expect(err).toEqual(null);

              checkPostExists(secondPath, function(err) {
                expect(err).toEqual(null);
                done();
              });
            });
          });
        });
      });
    });
  });

  // Allow pulls to go through under buggy conditions
  it("should reset any uncommitted changes to blog folder", function(done) {
    var path = "/Hello world.txt";
    var content = "Hello, World!";
    var contentBadChange = "Bad, World!";
    var contentGoodChange = "Good, World!";

    fs.outputFileSync(global.usersGitDirectory + path, content);

    pushAllChanges(global.usersGitClient, function(err) {
      expect(err).toEqual(null);

      waitForSyncToFinish(function(err) {
        expect(err).toEqual(null);

        checkPostExists(path, function(err) {
          expect(err).toEqual(null);

          fs.outputFileSync(localPath(global.blog.id, path), contentBadChange);
          fs.outputFileSync(global.usersGitDirectory + path, contentGoodChange);

          pushAllChanges(global.usersGitClient, function(err) {
            expect(err).toEqual(null);

            waitForSyncToFinish(function(err) {
              expect(err).toEqual(null);
              expect(
                fs.readFileSync(localPath(global.blog.id, path), "utf-8")
              ).toEqual(contentGoodChange);
              done();
            });
          });
        });
      });
    });
  });

  it("should return an error if there is no git repo in blog folder", function(done) {
    fs.removeSync(localPath(global.blog.id, ".git"));

    sync(global.blog.handle, function(err) {
      expect(err.message).toContain("repo does not exist");

      done();
    });
  });

  // Scenario: you push loads of files, Blot takes ages to sync
  // you push one more file: does Blot sync it too?
  it(
    "re-pulls if it recieves a push during sync",
    function(done) {
      var blogDir = localPath(global.blog.id, "/");
      var usersGitDirectory = global.usersGitDirectory;
      var path = "/Hello world.txt";
      var content = "Hello, World!";

      for (var i = 0; i < 100; i++)
        fs.outputFileSync(usersGitDirectory + "/" + i + ".txt", i);

      pushAllChanges(global.usersGitClient, function(err) {
        expect(err).toEqual(null);

        fs.outputFileSync(usersGitDirectory + path, content);

        pushAllChanges(global.usersGitClient, function(err) {
          expect(err).toEqual(null);

          waitForSyncToFinish(function(err) {
            expect(err).toEqual(null);

            // Verify files and folders are preserved in cloneable folder
            expect(fs.readdirSync(blogDir)).toEqual(
              fs.readdirSync(usersGitDirectory)
            );
            done();
          });
        });
      });
    },
    30000
  );

  // Git sometimes truncates path and I was running into this issue
  it("handles deeply nested files", function(done) {
    var blogDir = localPath(global.blog.id, "/");
    var path =
      "/Hello/you/fhjdskfhksdhfkj/fsdhfsjdkfhjkds/fsdhkjfsdhjk/fdshkfshjdkfjshdf/fdshjfhsdjk/fsdhjfksdjh/world.txt";
    var content = "Hello, World!";

    fs.outputFileSync(global.usersGitDirectory + path, content);

    pushAllChanges(global.usersGitClient, function(err) {
      expect(err).toEqual(null);

      waitForSyncToFinish(function(err) {
        expect(err).toEqual(null);

        checkPostExists(path, function(err) {
          expect(err).toEqual(null);

          // Verify files and folders are preserved in cloneable folder
          expect(fs.readdirSync(blogDir)).toEqual(
            fs.readdirSync(global.usersGitDirectory)
          );
          done();
        });
      });
    });
  });

  // what about a case sensitivity change?
  it("handles renamed files", function(done) {
    var blogDir = localPath(global.blog.id, "/");
    var firstPath =
      "/Hello/you/fhjdskfhksdhfkj/fsdhfsjdkfhjkds/fsdhkjfsdhjk/fdshkfshjdkfjshdf/fdshjfhsdjk/fsdhjfksdjh/Foo bar.txt";
    var secondPath =
      "/Hello/you/fhjdskfhksdhfkj/fsdhfsjdkfhjkds/fsdhkjfsdhjk/fdshkfshjdkfjshdf/fdshjfhsdjk/fsdhjfksdjh/baz Bat.txt";
    var content = "Hello, World!";

    fs.outputFileSync(global.usersGitDirectory + firstPath, content);

    pushAllChanges(global.usersGitClient, function(err) {
      expect(err).toEqual(null);

      waitForSyncToFinish(function(err) {
        expect(err).toEqual(null);

        fs.moveSync(
          global.usersGitDirectory + firstPath,
          global.usersGitDirectory + secondPath
        );

        pushAllChanges(global.usersGitClient, function(err) {
          expect(err).toEqual(null);

          waitForSyncToFinish(function(err) {
            expect(err).toEqual(null);

            checkPostExists(secondPath, function(err) {
              expect(err).toEqual(null);

              // Verify files and folders are preserved in cloneable folder
              expect(fs.readdirSync(blogDir)).toEqual(
                fs.readdirSync(global.usersGitDirectory)
              );

              done();
            });
          });
        });
      });
    });
  });
  it("accepts a push", function(done) {
    var blogDir = localPath(global.blog.id, "/");
    var path = "/Hello world.txt";
    var content = "Hello, World!";

    fs.outputFileSync(global.usersGitDirectory + path, content);

    pushAllChanges(global.usersGitClient, function(err) {
      expect(err).toEqual(null);

      waitForSyncToFinish(function(err) {
        expect(err).toEqual(null);

        checkPostExists(path, function(err) {
          expect(err).toEqual(null);

          // Verify files and folders are preserved in cloneable folder
          expect(fs.readdirSync(blogDir)).toEqual(
            fs.readdirSync(global.usersGitDirectory)
          );
          done();
        });
      });
    });
  });
});
