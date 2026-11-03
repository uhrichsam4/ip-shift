import Foundation
import WebKit
import UniformTypeIdentifiers

/// Serves ipshift://app/<path> from Bundle.main.resourceURL/web with a strict CSP.
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "ipshift"
    static let host = "app"
    static let csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; media-src 'self' blob:"

    let root: URL?

    override init() {
        root = Bundle.main.resourceURL?.appendingPathComponent("web", isDirectory: true).standardizedFileURL
        super.init()
    }

    static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html"
        case "js", "mjs": return "text/javascript"
        case "css": return "text/css"
        case "json", "map": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "avif": return "image/avif"
        case "gif": return "image/gif"
        case "ico": return "image/x-icon"
        case "glb": return "model/gltf-binary"
        case "gltf": return "model/gltf+json"
        case "hdr", "bin", "ktx2", "exr": return "application/octet-stream"
        case "wasm": return "application/wasm"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "ttf": return "font/ttf"
        case "otf": return "font/otf"
        case "mp4": return "video/mp4"
        case "webm": return "video/webm"
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        case "txt": return "text/plain"
        default:
            return UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
        }
    }

    /// Resolves a request path to a file inside root, or nil (blocks traversal and symlink escape).
    static func resolve(path rawPath: String, root: URL) -> URL? {
        let decoded = rawPath.removingPercentEncoding ?? rawPath
        if decoded.contains("\0") || decoded.contains("\\") { return nil }
        let comps = decoded.split(separator: "/", omittingEmptySubsequences: true)
        if comps.contains(where: { $0 == ".." || $0 == "." }) { return nil }
        var rel = comps.joined(separator: "/")
        if rel.isEmpty { rel = "index.html" }
        let candidate = root.appendingPathComponent(rel).standardizedFileURL.resolvingSymlinksInPath()
        let rootPath = root.resolvingSymlinksInPath().path
        guard candidate.path == rootPath || candidate.path.hasPrefix(rootPath + "/") else { return nil }
        return candidate
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, url.scheme == Self.scheme, url.host == Self.host else {
            task.didFailWithError(URLError(.unsupportedURL)); return
        }
        guard let root, let file = Self.resolve(path: url.path, root: root) else {
            respond(task, url: url, status: 404, mime: "text/plain", data: Data("Not found".utf8)); return
        }
        var isDir: ObjCBool = false
        var target = file
        if FileManager.default.fileExists(atPath: file.path, isDirectory: &isDir), isDir.boolValue {
            target = file.appendingPathComponent("index.html")
        }
        guard let data = try? Data(contentsOf: target) else {
            respond(task, url: url, status: 404, mime: "text/plain", data: Data("Not found".utf8)); return
        }
        respond(task, url: url, status: 200, mime: Self.mimeType(for: target.pathExtension), data: data)
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private func respond(_ task: WKURLSchemeTask, url: URL, status: Int, mime: String, data: Data) {
        var headers = [
            "Content-Type": mime.hasPrefix("text/") || mime == "application/json" ? "\(mime); charset=utf-8" : mime,
            "Content-Length": "\(data.count)",
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
        ]
        headers["Content-Security-Policy"] = Self.csp
        let resp = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(resp)
        task.didReceive(data)
        task.didFinish()
    }
}
