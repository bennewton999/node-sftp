/**
 * @package node-sftp
 * @copyright  Copyright(c) 2011 Ajax.org B.V. <info AT ajax.org>
 * @author Fabian Jakobs <fabian AT ajax DOT org>
 * @author Mike de Boer <mike AT ajax DOT org>
 * @license http://github.com/ajaxorg/node-sftp/blob/master/LICENSE MIT License
 */

var child_process = require("child_process");
var fs = require("fs");
var Util = require("./util");

var pubkey='ssh-dss AAAAB3NzaC1kc3MAAACBAJC7MOSXuIdY/y+K7KONsJ2M+KHLAczwox10Vd2KgBW6OALMom5Pgqk9LjoINy49ofDR/Gm2L5aNQ3pKVgsj8C7GDH9L1cRWk9uAfvObFJl0Irts5MrZqpTEjaWz2//WAVW3fiUCTYU+7QsM+DkCCTIxfsw7Lfj/rLfiKs1URbfNAAAAFQCDwY3rgx9CR0H3x4eDxre95ZyvwwAAAIBJr3lfrGkBDFl98O16b6sneVso9og3gXI1q7eJ4blf41PjJAnvHjcF5T3Q2XdMYo93+YYUE2xma+34aRDJzV1UUH4BEzml/Tk+WUT0Nfr2loJZkAxioLEkvXV1FggK9dBg7yP+k+CZwcGtJholHMK1pG+A8lNII3g29S+XMmsWdQAAAIBwpKJr92gM0NfFefKtJmUUtUp7oP5lKqZMzcwKnnEWeMclYtGpsp+qrvOpmwaLFLgDmSDx4HKuRrxooC8uaRVkz9c/MOK2tOD6tiNlUkd4/fN4H3Qqpg3r+EypSgTXgM6FurH9DvIVz41qYu5U55+VZ+Xg2EoNb5XKorBDll54CQ== cscmsplmt@TCSAMCSCAPPR';

exports.buildArgs = function(prvkeyFile, host) {
    var args = [
        "-o", "PasswordAuthentication=no",
        "-o", "IdentityFile=" + prvkeyFile,
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "StrictHostKeyChecking=no",
        // force pseudo terminal to make sure that the remote process is killed
        // when the local ssh process is killed
        "-t", "-t",
        //"-o", "IdentitiesOnly=yes", // this breaks some ssh servers
        "-o", "BatchMode=yes"
    ];
    if (host)
        args.push(host);
    console.log(args);
    console.log('pubkey='+pubkey);
    return args;
};

exports.spawnWithKeyFile = function(prvkeyFile, host, command, args) {
    var sshArgs = exports.buildArgs(prvkeyFile, host);
    
    var args = sshArgs.concat(command ? [command] : []).concat(args || []);
    console.log("executing: ssh " + args.join(" "));
    
    return child_process.spawn("ssh", args);
};

exports.writeKeyFile = function(prvkey, callback) {
    var filename = Util.DEFAULT_TMPDIR + "/" + Util.uuid();
    fs.writeFile(filename, prvkey, function(err) {
        if (err)
            return callback(err);

        fs.chmod(filename, 0600, function(err) {
            callback(err, filename);
        });
    });
};

exports.writeKeyFiles = function(prvkey, pubkey, callback) {
    var filename = Util.DEFAULT_TMPDIR + "/" + Util.uuid();
    fs.writeFile(filename, prvkey, function(err) {
        if (err)
            return callback(err);

        fs.chmod(filename, 0600, function(err) {
            fs.writeFile(filename + ".pub", pubkey, function(err) {
                if (err)
                    return callback(err);
        
                fs.chmod(filename + ".pub", 0600, function(err) {
                    callback(err, filename);
                });
            });
        });
    });
};

exports.spawn = function(prvkey, host, command, args, callback) {
    exports.writeKeyFile(prvkey, function(err, filename) {
        var child = exports.spawnWithKeyFile(filename, host, command, args);

        child.on("exit", function(code) {
            fs.unlink(filename, function() {});
        });
        
        callback(null, child);
    });
};

exports.exec = function(prvkey, host, command, args, callback) {
    exports.spawn(prvkey, host, command, args, function(err, child) {
        if (err)
            return callback(err);
            
        var out = err = "";

        child.stdout.on("data", function (data) {
            out += data;
        });

        child.stderr.on("data", function (data) {
            err += data;
        });
        
        child.on("exit", function(code) {
            callback(code, out, err);
        });
    });
};

exports.generateKeyPair = function(email, callback) {
    var filename = Util.DEFAULT_TMPDIR + "/" + Util.uuid();
    var phrase = "";

    var command = "ssh-keygen -t rsa " +
        "-f \"" + filename + "\" " +
        "-P \"" + phrase   + "\" " +
        "-C \"" + email  + "\" ";

    child_process.exec(command, function (err, stdout, stderr) {
        if (err)
            return callback(err);
            
        fs.readFile(filename + ".pub", function (err, pubkey) {
            if (err)
                return callback(err);
                
            fs.readFile(filename, function (err, prvkey) {
                if (err)
                    return callback(error);
                    
                fs.unlink(filename + ".pub", function() {
                    fs.unlink(filename, function() {
                        callback(null, pubkey.toString(), prvkey.toString());
                    });
                });
                
            });
        });
    });
};

exports.validateSSHKey = function(prvkey, host, callback) {
    exports.exec(prvkey, host, "", [], function(err, stdout, stderr) {
        //console.log("out >> " + stdout)
        //console.log("err >> " + stderr)
        //console.log(err)
        callback(null, !stderr.match(/Permission denied \(.*publickey/));
    });
};
