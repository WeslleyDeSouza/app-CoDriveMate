// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CodrivemateMapboxNative",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "CodrivemateMapboxNative", targets: ["MapboxNativePlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/mapbox/mapbox-maps-ios.git", from: "11.35.2")
    ],
    targets: [
        .target(
            name: "MapboxNativePlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "MapboxMaps", package: "mapbox-maps-ios")
            ],
            path: "ios/Sources/MapboxNativePlugin")
    ]
)
