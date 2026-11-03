// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "IPShift",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "IPShift", targets: ["IPShiftApp"]),
        .executable(name: "ipshift-cli", targets: ["ipshift-cli"]),
        .library(name: "IPShiftCore", targets: ["IPShiftCore"]),
    ],
    targets: [
        .target(
            name: "IPShiftCore",
            linkerSettings: [
                .linkedFramework("SystemConfiguration"),
                .linkedFramework("CoreWLAN"),
                .linkedFramework("CoreLocation"),
                .linkedFramework("Network"),
                .linkedFramework("Security"),
            ]
        ),
        .executableTarget(
            name: "IPShiftApp",
            dependencies: ["IPShiftCore"],
            linkerSettings: [.linkedFramework("AppKit"), .linkedFramework("WebKit")]
        ),
        .executableTarget(name: "ipshift-cli", dependencies: ["IPShiftCore"]),
        .testTarget(name: "IPShiftCoreTests", dependencies: ["IPShiftCore"]),
    ]
)
