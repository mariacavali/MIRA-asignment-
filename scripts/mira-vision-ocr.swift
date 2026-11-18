import Foundation
import Vision
import ImageIO

// JSONL worker. Native macOS OCR only; no network/model-provider calls.
// Coordinates are normalised top-left, with words retained for layout/table QA.
struct Input: Decodable { let path: String; let language: String?; let correction: Bool? }
func box(_ r: CGRect) -> [Double] { [Double(r.minX), Double(1-r.maxY), Double(r.maxX), Double(1-r.minY)] }
while let line = readLine() {
    autoreleasepool {
        do {
            let input = try JSONDecoder().decode(Input.self, from: Data(line.utf8))
            let url = URL(fileURLWithPath: input.path)
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw NSError(domain: "MiraOCR", code: 1) }
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = [input.language ?? "en-US"]
            request.usesLanguageCorrection = input.correction ?? false
            request.minimumTextHeight = 0.002
            let start = Date()
            try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
            let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
                guard let best = observation.topCandidates(1).first else { return nil }
                let text = best.string
                let regex = try! NSRegularExpression(pattern: "\\S+")
                let words: [[String: Any]] = regex.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { match in
                    guard let range = Range(match.range, in: text), let rect = try? best.boundingBox(for: range) else { return nil }
                    return ["text": String(text[range]), "box": box(rect.boundingBox)]
                }
                return ["text": text, "confidence": best.confidence, "box": box(observation.boundingBox), "words": words,
                        "alternatives": observation.topCandidates(3).map { ["text": $0.string, "confidence": $0.confidence] }]
            }
            let result: [String: Any] = ["ok": true, "width": image.width, "height": image.height, "seconds": Date().timeIntervalSince(start), "lines": lines]
            let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
            print(String(data: data, encoding: .utf8)!); fflush(stdout)
        } catch {
            let data = try! JSONSerialization.data(withJSONObject: ["ok": false, "error": String(describing: error)], options: [.sortedKeys])
            print(String(data: data, encoding: .utf8)!); fflush(stdout)
        }
    }
}
