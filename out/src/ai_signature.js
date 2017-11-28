'use strict'

var { languages, SignatureHelp, SignatureInformation, ParameterInformation, MarkdownString } = require('vscode')
var mergeJSON = require('merge-json')
var fs = require('fs')
var path = require('path')
var mainFunctions = require('./signatures/functions.json')
var udfs = require('./signatures/udfs.json')

var defaultSigs = mergeJSON.merge(mainFunctions, udfs)
var currentIncludeFiles = []
var includes = {}

module.exports = languages.registerSignatureHelpProvider({ language: 'autoit', scheme: 'file' }, {
    provideSignatureHelp(document, position, token) {
        // Find out what called for sig
        let caller = getCallInfo(document, position)
        if (caller == null) {
            return null
        }

        //Integrate user functions
        var signatures = mergeJSON.merge(defaultSigs, getIncludes(document))

        //Get the called word from the json files
        let foundSig = signatures[caller.func]
        if (foundSig == null) {
            return null
        }


        // let declarationText, sig
        let result = new SignatureHelp()
        let si = new SignatureInformation(foundSig.label, 
            new MarkdownString("*" + foundSig.documentation + "*"))
            //Enter parameter information into signature information
        foundSig.params.forEach(element => {
            si.parameters.push(new ParameterInformation(element.label, 
                new MarkdownString(element.documentation)))
        })

        //Place signature information into results
        result.signatures = [si]
        result.activeSignature = 0
        result.activeParameter = caller.commas

        return result
    }
}, '(', ',')


function getCallInfo(doc, pos) {
    // Acquire the text up the point where the current cursor/paren/comma is at
    let currentLine = doc.lineAt(pos.line).text.substring(0, pos.character)
    // Remove whole functions from the string for easier parsing
    currentLine = currentLine.replace(/\w+\([^()]*\)/g, '')
        .replace(/"[^"]*"/, '').replace(/"[^"]*(?=$)/, '')
    // Remove paren sets for easier parsing
    currentLine = currentLine.replace(/\([^()]*\)/g, '')
    // Remove multiple open paren for easier parsing
    currentLine = currentLine.replace(/\({2,}/g, '(')
    // Split the string by open parens
    let parenSplit = currentLine.split('(')
    // Get the length - 2 item
    var currentFunc = parenSplit[parenSplit.length - 2]
    currentFunc = currentFunc.match(/(.*)\b(\w+)/)[2]
    // Find the position of the closest/last open paren
    let openParen = currentLine.lastIndexOf('(')
    // Count non-string commas in text following open paren
    let commas = currentLine.slice(openParen).match(/(?!\B["'][^"']*),(?![^"']*['"]\B)/g)
    if (commas === null) {
        commas = 0
    } else {
        commas = commas.length
    }

    return {
        func: currentFunc,
        commas: commas
    }
}

function getIncludes(doc) { // determines whether includes should be re-parsed or not.
    var text = doc.getText()
    var pattern = null
    const includePattern = /^\s+#include\s"(.+)"/gm
    var includesCheck = []

    while (pattern = includePattern.exec(text)) {
        includesCheck.push(pattern[1])
    }

    if (!arraysMatch(includesCheck, currentIncludeFiles)) {
        includes = {}
        for (var i in includesCheck) {
            var newIncludes = getIncludeData(includesCheck[i], doc)
            Object.assign(includes, newIncludes)
        }
        currentIncludeFiles = includesCheck
    }

    return includes
}

function getIncludeData(fileName, doc) {
    // console.log(fileName)
    const _includeFuncPattern = /(?=\S)(?!;~\s)Func\s+((\w+)\((.+)\))/g
    var functions = {}
    var filePath = ""

    if (fileName.charAt(1) == ':') {
        filePath = fileName
    } else {
        filePath = path.normalize(path.dirname(doc.fileName) + 
        ((fileName.charAt(0) == '\\' || fileName.charAt(0) == '\/') ? '' : '\\') +
        fileName)
    }
    filePath = filePath.charAt(0).toUpperCase() + filePath.slice(1)
    
    var pattern = null
    var fileData = fs.readFileSync(filePath).toString()
    
    while ((pattern = _includeFuncPattern.exec(fileData)) !== null) {
        functions[pattern[2]] = { 
                label: pattern[1],
                params: getParams(pattern[3]) 
            }
    }

    return functions
}

function getParams(paramText) {
    var params = paramText.split(",")

    for (var p in params) {
        params[p] = { label: params[p].trim() }
    }
    
    return params
}


function arraysMatch(arr1, arr2) {
    if (arr1.length == arr2.length &&
        arr1.some((v) => arr2.indexOf(v) <= 0)) {
        return true
    } else {
        return false
    }
}