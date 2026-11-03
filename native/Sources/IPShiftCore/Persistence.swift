import Foundation

public enum DataDirectory {
    /// ~/Library/Application Support/IP SHIFT, or $IPSHIFT_DATA_DIR when set (tests).
    public static func url() -> URL {
        if let o = ProcessInfo.processInfo.environment["IPSHIFT_DATA_DIR"], !o.isEmpty {
            return URL(fileURLWithPath: o, isDirectory: true)
        }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return base.appendingPathComponent("IP SHIFT", isDirectory: true)
    }
}

public final class HistoryStore: @unchecked Sendable {
    public static let cap = 500
    private let fileURL: URL
    private let lock = NSLock()

    public init(directory: URL = DataDirectory.url()) {
        fileURL = directory.appendingPathComponent("history.json")
    }

    public func list() -> [HistoryEntry] {
        lock.lock(); defer { lock.unlock() }
        return load()
    }

    private func load() -> [HistoryEntry] {
        guard let data = try? Data(contentsOf: fileURL) else { return [] }
        return (try? JSONDecoder().decode([HistoryEntry].self, from: data)) ?? []
    }

    private func save(_ entries: [HistoryEntry]) throws {
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try JSON.encoder(pretty: true).encode(entries)
        try data.write(to: fileURL, options: .atomic)
    }

    @discardableResult
    public func add(_ entry: HistoryEntry) throws -> [HistoryEntry] {
        lock.lock(); defer { lock.unlock() }
        var all = load().filter { $0.id != entry.id }
        all.insert(entry, at: 0) // newest first
        if all.count > Self.cap { all = Array(all.prefix(Self.cap)) }
        try save(all)
        return all
    }

    public func clear() throws -> Int {
        lock.lock(); defer { lock.unlock() }
        let n = load().count
        try save([])
        return n
    }

    public func exportData() throws -> Data {
        try JSON.encoder(pretty: true).encode(list())
    }
}

public final class SettingsStore: @unchecked Sendable {
    private let fileURL: URL
    private let lock = NSLock()
    private var cached: Settings?

    public init(directory: URL = DataDirectory.url()) {
        fileURL = directory.appendingPathComponent("settings.json")
    }

    public func get() -> Settings {
        lock.lock(); defer { lock.unlock() }
        if let cached { return cached }
        var s = Settings()
        if let data = try? Data(contentsOf: fileURL), let d = try? JSONDecoder().decode(Settings.self, from: data) { s = d }
        cached = s
        return s
    }

    public func update(_ patch: [String: Any]) throws -> Settings {
        let next = try get().applying(patch)
        lock.lock(); defer { lock.unlock() }
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSON.encoder(pretty: true).encode(next).write(to: fileURL, options: .atomic)
        cached = next
        return next
    }
}
