"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const httpc = require("typed-rest-client/HttpClient");
const map = __importStar(require("./mappers"));
const util = __importStar(require("./util"));
const fs = __importStar(require("fs"));
var FormData = require('form-data');
const resultFolder = 'dropResults';
const baseURL = 'https://testmanager-rel.wus2.cnt-dev.azcnt-test.io/';
const httpClient = new httpc.HttpClient('user-agent');
let testName = '';
let resourceId = '';
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            map.getInputParams();
            resourceId = map.getResourceId();
            testName = map.getTestName();
            if (fs.existsSync(resultFolder)) {
                util.deleteFile(resultFolder);
            }
            fs.mkdirSync(resultFolder);
            yield createTestAPI();
        }
        catch (err) {
            core.setFailed(err.message);
        }
    });
}
function createTestAPI() {
    return __awaiter(this, void 0, void 0, function* () {
        var urlSuffix = "loadtests/" + testName + "?resourceId=" + resourceId + "&api-version=2021-07-01-preview";
        urlSuffix = baseURL + urlSuffix;
        var createData = map.createTestData();
        let header = yield map.createTestHeader();
        let createTestresult = yield httpClient.request('patch', urlSuffix, JSON.stringify(createData), header);
        if (createTestresult.message.statusCode != 200 && createTestresult.message.statusCode != 201)
            throw "Error in creating test" + testName;
        if (createTestresult.message.statusCode == 201) {
            console.log("Creating a new load test " + testName);
            console.log("Successfully created load test " + testName);
        }
        else
            console.log("Test already exists");
        yield uploadTestPlan();
    });
}
function uploadTestPlan() {
    return __awaiter(this, void 0, void 0, function* () {
        let filepath = map.getTestFile();
        let filename = map.getFileName(filepath);
        var urlSuffix = "file/" + filename + ":validate?resourceId=" + resourceId + "&api-version=2021-07-01-preview";
        urlSuffix = baseURL + urlSuffix;
        var uploadData = map.uploadFileData(filepath);
        let headers = yield map.UploadAndValidateHeader(uploadData);
        let validateresult = yield httpClient.post(urlSuffix, uploadData, headers);
        if (validateresult.message.statusCode != 200)
            throw "Invalid TestPlan";
        else {
            urlSuffix = "loadtests/" + testName + "/files/" + filename + "?resourceId=" + resourceId + "&api-version=2021-07-01-preview";
            urlSuffix = baseURL + urlSuffix;
            var uploadData = map.uploadFileData(filepath);
            let headers = yield map.UploadAndValidateHeader(uploadData);
            let uploadresult = yield httpClient.request('put', urlSuffix, uploadData, headers);
            if (uploadresult.message.statusCode != 201)
                throw "Error in uploading TestPlan for the created test";
            else {
                console.log("Uploaded test plan for the test");
                var statuscode = yield uploadConfigFile();
                if (statuscode == 201)
                    yield createTestRun();
            }
        }
    });
}
function uploadConfigFile() {
    return __awaiter(this, void 0, void 0, function* () {
        let configFiles = map.getConfigFiles();
        if (configFiles != undefined && configFiles.length > 0) {
            for (const filepath of configFiles) {
                let filename = map.getFileName(filepath);
                var urlSuffix = "loadtests/" + testName + "/files/" + filename + "?resourceId=" + resourceId + "&api-version=2021-07-01-preview";
                urlSuffix = baseURL + urlSuffix;
                var uploadData = map.uploadFileData(filepath);
                let headers = yield map.UploadAndValidateHeader(uploadData);
                let uploadresult = yield httpClient.put(urlSuffix, uploadData, headers);
                if (uploadresult.message.statusCode != 201)
                    throw "Error in uploading config file for the created test";
            }
        }
        return 201;
    });
}
function createTestRun() {
    return __awaiter(this, void 0, void 0, function* () {
        const tenantId = map.getTenantId();
        const testRunId = util.getTestRunId();
        var urlSuffix = "testruns/" + testRunId + "?tenantId=" + tenantId + "&resourceId=" + resourceId + "&api-version=2021-07-01-preview";
        urlSuffix = baseURL + urlSuffix;
        try {
            var startData = map.startTestData(testRunId);
            console.log("Creating and running a testRun for the test");
            let header = yield map.createTestHeader();
            let startTestresult = yield httpClient.patch(urlSuffix, JSON.stringify(startData), header);
            if (startTestresult.message.statusCode != 202)
                throw "Error in running the test";
            let startTime = new Date();
            let startResp = yield startTestresult.readBody();
            let testRunDao = JSON.parse(startResp);
            let portalUrl = testRunDao.portalUrl;
            let status = testRunDao.status;
            if (status == "ACCEPTED") {
                console.log("View the load test run in progress at: " + portalUrl);
                yield getTestRunAPI(testRunId, status, startTime);
            }
        }
        catch (err) {
            err.message = "Error in running the test";
            throw err;
        }
    });
}
function getTestRunAPI(testRunId, testStatus, startTime) {
    return __awaiter(this, void 0, void 0, function* () {
        var urlSuffix = "testruns/" + testRunId + "?resourceId=" + resourceId + "&api-version=2021-07-01-preview";
        urlSuffix = baseURL + urlSuffix;
        while (testStatus != "DONE" && testStatus != "FAILED" && testStatus != "CANCELLED") {
            let header = yield map.getTestRunHeader();
            let testRunResult = yield httpClient.get(urlSuffix, header);
            let testRunResp = yield testRunResult.readBody();
            let testRunObj = JSON.parse(testRunResp);
            testStatus = testRunObj.status;
            if (testStatus == "DONE") {
                util.printTestDuration(testRunObj.vusers, startTime);
                var testResultUrl = util.getResultFolder(testRunObj.testArtifacts);
                if (testResultUrl != null) {
                    const response = yield httpClient.get(testResultUrl);
                    if (response.message.statusCode != 200) {
                        throw "Error in fetching clientmetrics ";
                    }
                    else {
                        var obj = yield util.getResultsFile(response);
                        if (obj != undefined)
                            yield util.getStatisticsFile(obj);
                    }
                }
                return;
            }
            else if (testStatus === "FAILED" || testStatus === "CANCELLED") {
                core.setFailed("TestStatus: " + testStatus);
                return;
            }
            else {
                if (testStatus != "DONE" && testStatus != "FAILED" && testStatus != "CANCELLED") {
                    if (testStatus === "DEPROVISIONING" || testStatus === "DEPROVISIONED" || testStatus != "EXECUTED")
                        yield util.sleep(5000);
                    else
                        yield util.sleep(20000);
                }
            }
        }
    });
}
run();