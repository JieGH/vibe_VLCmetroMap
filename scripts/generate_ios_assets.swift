import AppKit
import CoreGraphics
import Foundation

func hexColor(_ hex: String) -> CGColor {
    var str = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if str.hasPrefix("#") { str.removeFirst() }
    var rgb: UInt64 = 0
    Scanner(string: str).scanHexInt64(&rgb)
    let r = CGFloat((rgb >> 16) & 0xFF) / 255.0
    let g = CGFloat((rgb >> 8) & 0xFF) / 255.0
    let b = CGFloat(rgb & 0xFF) / 255.0
    return CGColor(red: r, green: g, blue: b, alpha: 1.0)
}

let bgColor = hexColor("#16161f")
let redColor = hexColor("#E2001A")
let yellowColor = hexColor("#FFD100")
let greenColor = hexColor("#00994D")
let whiteColor = hexColor("#FFFFFF")

func drawMetroMark(in ctx: CGContext, bounds: CGRect) {
    // Metro Valencia interchange mark based on public/favicon.svg (64x64 grid)
    let scale = bounds.width / 64.0
    let ox = bounds.origin.x
    let oy = bounds.origin.y

    ctx.saveGState()
    ctx.setLineCap(.round)
    ctx.setLineWidth(7.5 * scale)

    // In CoreGraphics with standard coordinate space:
    // (11, 53) to (53, 11) -> Red line (Line 3)
    ctx.setStrokeColor(redColor)
    ctx.beginPath()
    ctx.move(to: CGPoint(x: ox + 11.0 * scale, y: oy + (64.0 - 53.0) * scale))
    ctx.addLine(to: CGPoint(x: ox + 53.0 * scale, y: oy + (64.0 - 11.0) * scale))
    ctx.strokePath()

    // (9, 32) to (55, 32) -> Yellow line (Line 1)
    ctx.setStrokeColor(yellowColor)
    ctx.beginPath()
    ctx.move(to: CGPoint(x: ox + 9.0 * scale, y: oy + (64.0 - 32.0) * scale))
    ctx.addLine(to: CGPoint(x: ox + 55.0 * scale, y: oy + (64.0 - 32.0) * scale))
    ctx.strokePath()

    // (11, 11) to (53, 53) -> Green line (Line 5)
    ctx.setStrokeColor(greenColor)
    ctx.beginPath()
    ctx.move(to: CGPoint(x: ox + 11.0 * scale, y: oy + (64.0 - 11.0) * scale))
    ctx.addLine(to: CGPoint(x: ox + 53.0 * scale, y: oy + (64.0 - 53.0) * scale))
    ctx.strokePath()

    // Station outer dark ring at (32, 32), radius 10
    ctx.setFillColor(bgColor)
    let outerR = 10.0 * scale
    ctx.fillEllipse(in: CGRect(x: ox + (32.0 * scale) - outerR, y: oy + (32.0 * scale) - outerR, width: outerR * 2, height: outerR * 2))

    // Station inner white circle at (32, 32), radius 6.5
    ctx.setFillColor(whiteColor)
    let innerR = 6.5 * scale
    ctx.fillEllipse(in: CGRect(x: ox + (32.0 * scale) - innerR, y: oy + (32.0 * scale) - innerR, width: innerR * 2, height: innerR * 2))

    ctx.restoreGState()
}

func savePNG(image: CGImage, to path: String) {
    let url = URL(fileURLWithPath: path)
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else {
        fatalError("Cannot create CGImageDestination for \(path)")
    }
    CGImageDestinationAddImage(dest, image, nil)
    guard CGImageDestinationFinalize(dest) else {
        fatalError("Cannot finalize PNG to \(path)")
    }
    print("Saved \(path)")
}

// 1. Generate AppIcon (1024x1024, opaque full bleed)
func generateAppIcon() {
    let size = 1024
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue)
    guard let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4, space: colorSpace, bitmapInfo: bitmapInfo.rawValue) else {
        fatalError("Failed to create context for AppIcon")
    }

    // Fill background
    ctx.setFillColor(bgColor)
    ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))

    // Draw mark scaled with comfortable padding (e.g. 800x800 centered)
    let iconSize: CGFloat = 800.0
    let offset: CGFloat = (CGFloat(size) - iconSize) / 2.0
    drawMetroMark(in: ctx, bounds: CGRect(x: offset, y: offset, width: iconSize, height: iconSize))

    guard let img = ctx.makeImage() else { fatalError("makeImage failed") }
    savePNG(image: img, to: "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")
}

// 2. Generate Splash (2732x2732)
func generateSplash() {
    let size = 2732
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue)
    guard let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4, space: colorSpace, bitmapInfo: bitmapInfo.rawValue) else {
        fatalError("Failed to create context for Splash")
    }

    // Fill background
    ctx.setFillColor(bgColor)
    ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))

    // Centered mark with rounded container card
    let iconBoxSize: CGFloat = 480.0
    let boxX = (CGFloat(size) - iconBoxSize) / 2.0
    let boxY = (CGFloat(size) - iconBoxSize) / 2.0 // perfectly centered

    // Rounded rectangle badge for the icon
    let badgePath = CGPath(roundedRect: CGRect(x: boxX, y: boxY, width: iconBoxSize, height: iconBoxSize), cornerWidth: 105, cornerHeight: 105, transform: nil)
    ctx.saveGState()
    ctx.setFillColor(hexColor("#1e1e2a"))
    ctx.addPath(badgePath)
    ctx.fillPath()

    // Draw mark inside badge with internal padding
    let innerPadding: CGFloat = 40.0
    let markBounds = CGRect(x: boxX + innerPadding, y: boxY + innerPadding, width: iconBoxSize - innerPadding * 2, height: iconBoxSize - innerPadding * 2)
    drawMetroMark(in: ctx, bounds: markBounds)
    ctx.restoreGState()

    guard let img = ctx.makeImage() else { fatalError("makeImage failed") }
    savePNG(image: img, to: "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png")
    savePNG(image: img, to: "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png")
    savePNG(image: img, to: "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png")
}

generateAppIcon()
generateSplash()
print("All iOS assets generated successfully!")
