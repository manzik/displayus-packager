#!/usr/bin/env node

var realcl = console.log;
console.info = (x) => { realcl('\x1b[36m%s\x1b[0m', x); };
console.warn = (x) => { realcl('\x1b[33m%s\x1b[0m', x); };
console.error = (x) => { realcl('\x1b[31m%s\x1b[0m', x); };
var fs = require("fs"), fse = require("fs-extra"), path = require("path"), rimraf = require("rimraf");
var argv = require('minimist')(process.argv.slice(2));
var out = argv["out"] || argv["o"] || ".";
var inp = argv["_"];

if (argv["h"] || argv["help"])
{
    console.log(`
input files  : Path to plugin files
-i --install : Install input paths directly to displayus app
-o --out     : Path to output plugin packaged .dus file

Example:

displayus-packager . --out=..

Packages plugin files in current path and output .dus file in parent directory
    `);
    return;
}

var tmppath = path.join(__dirname, "tmp");
rimraf.sync(tmppath);
fs.mkdirSync(tmppath);

var tmpzipfilespath = path.join(tmppath, "zipfiles");
rimraf.sync(tmpzipfilespath);
fs.mkdirSync(tmpzipfilespath);

var tmppluginfilespath = path.join(tmppath, "pluginfiles");
rimraf.sync(tmppluginfilespath);
fs.mkdirSync(tmppluginfilespath);

var installmode = !!(argv["i"] || argv["install"]);

if (installmode)
    console.info("Entering as install mode.")
else
    console.info("Entering as packaging mode.");

function exit()
{
    console.info("Exiting...");
    return;
}

if (!installmode)
    if (out.substring(out.length-4)!==".dus"&&!fs.existsSync(out))
    {
        console.info("Output path specified is not avilable, creating the directory.");
        require("mkdirp").sync(out);
    }
var allcurrentdirs = false;
if (!inp.length)
{
    console.info("Packaging all plugins in current directory.");
    inp = fs.readdirSync(process.cwd())
        .filter(file => fs.lstatSync(path.join(process.cwd(), file)).isDirectory());
    if (!inp.length)
    {
        console.error("Didnt find any folder in current directory");
        exit();
    }
    allcurrentdirs = true;
    
}

var notvalidinds = [];
inp.forEach((inpath, i) =>
{
    if (!fs.existsSync(inpath))
    {
        notvalidinds.push(i);
        console.warn("Input path \"" + inpath + "\" was invaild, ignoring...");
        inp.splice(i, 1);
    }
    else
        inp[i] = path.resolve(inpath);
});
if (!inp.length)
{
    console.error("None of input path was valid");
    exit();
    return;
}
if (!installmode)
{
    try
    {
        out = path.resolve(out);
    }
    catch (e)
    {
        console.error("Invalid output path: " + out);
        exit();
        return;
    }
}

var arr_paths = [];
function addfoldertopacktemp(inpath)
{
    arr_paths.push(path.join(tmppluginfilespath, getfoldername(inpath)));
    fse.copySync(inpath, path.join(tmppluginfilespath, getfoldername(inpath)));
    console.info("Added plugin at path: " + inpath);
}
function validatepluginfolder(inpath)
{
    var pjpath = path.join(inpath, "package.json");
    var pjdata;
    try
    {
        pjdata = fs.readFileSync(pjpath);
    }
    catch (e)
    {
        return { e: "error reading package.json : " + e, silent: allcurrentdirs };
    }
    try
    {
        pjdata = JSON.parse(pjdata);
    }
    catch (e)
    {
        return { e: "error parsing package.json as json : " + e };
    }
    if (!pjdata.title)
        console.warn("No title found for plugin in path: " + inpath);
    var paths = [
        { required: true, defpath: "index.html", filetype: "main wallpaper page", prop: "wallpaper" }
        , { required: false, defpath: "modify.html", filetype: "item modify page", prop: "modify" }
        , { required: false, defpath: "settings.html", filetype: "plugin settings page", prop: "settings" }
    ];
    var err = false;
    paths.forEach((fobj) =>
    {
        if (pjdata[fobj.prop] || fobj.required)
        {
            var fpath = pjdata[fobj.prop] || fobj.defpath;
            var defpath = fpath == fobj.defpath;
            fpath = path.join(inpath, fpath);
            if (!fs.existsSync(fpath))
            {
                err = { e: fobj.filetype + "file not found in path: " + fpath + (defpath ? "(tried to use default path " + fobj.defpath + ")" : "(used your specified path)") };
                return false;
            }
        }
    });
    if (err)
    {
        return err;
    }
    return { e: undefined };
}

function getfoldername(inpath)
{
    var arr_path = inpath.split("\\").join("/").split("/");
    return arr_path[arr_path.length - 1];
}

function ziptemppath(cb)
{
    var archiver = require('archiver');
    var outres = path.join(tmpzipfilespath, "result.zip");
    var output = fs.createWriteStream(outres);
    var archive = archiver('zip', {
        zlib: { level: 9 }
    });

    output.on('close', function ()
    {
        cb(false, outres);
    });

    archive.on('error', function (err)
    {
        cb(err);
    });

    archive.pipe(output);
    arr_paths.forEach((inpath) =>
    {
        archive.directory(inpath, getfoldername(inpath));
    });


    archive.finalize();
}

function copytooutput(inpath)
{
    var outputisdir = false;
    var fs = require('fs');
    try
    {
        if (fs.lstatSync(out).isDirectory())
        {
            outputisdir = true;
        }
    }
    catch (e)
    {
    }
    var outputfilename = outputisdir ? arr_paths.map((x) => { return getfoldername(x); }).join(",") + ".dus" : getfoldername(out);
    var outpath = path.join(outputisdir ? out : out.substring(0, out.indexOf(getfoldername(out))), outputfilename);
    fse.copySync(inpath, outpath);
    return outpath;
}

console.info("Started " + (installmode ? "installing" : "packaging") + "...");
var errcount = 0;
inp.forEach((inpath) =>
{
    console.info("Start adding plugin at path: " + inpath);
    validatepluginfolderres = validatepluginfolder(inpath);
    if (validatepluginfolderres.e)
    {
        if (!validatepluginfolderres.silent)
            console.error("Error with plugin in path " + inpath + " : " + validatepluginfolderres.e);
        errcount++;
    }
    else
        addfoldertopacktemp(inpath);
});
if (errcount == inp.length)
{
    console.error("All of input plugin paths returned error");
    exit();
    return;
}
if (installmode)
{
    console.info("Adding plugin to Displayus app.");
    arr_paths.forEach((inpath) =>
    {
        console.info("Adding plugin: " + getfoldername(inpath));
        fse.copySync(inpath, path, join(process.env.APPDATA, "Displayus", getfoldername(inpath)));
    });

}
else
{
    console.info("Packing plugins");
    ziptemppath((err, inpath) =>
    {
        if (err)
        {
            console.error("Error generating zip for .dus file: " + err);
            return;
        }
        console.info("Copying generated plugin(.dus) file to output path");
        var opath = copytooutput(inpath);
        console.info("Successfully generated plugin file, output file: " + opath);
        console.info("Done");
    });
}