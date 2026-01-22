// Angle utility functions

const PI = Math.PI;
const TWO_PI = Math.PI * 2;

export function simplifyAngle(angle) {
    while (angle >= TWO_PI) angle -= TWO_PI;
    while (angle < 0) angle += TWO_PI;
    return angle;
}

export function relativeAngleDiff(angle, anchor) {
    angle = simplifyAngle(angle + PI - anchor);
    anchor = PI;
    return anchor - angle;
}

export function constrainAngle(angle, anchor, constraint) {
    if (Math.abs(relativeAngleDiff(angle, anchor)) <= constraint) return simplifyAngle(angle);
    if (relativeAngleDiff(angle, anchor) > constraint) return simplifyAngle(anchor - constraint);
    return simplifyAngle(anchor + constraint);
}

// Get the shortest angle difference between two angles (-PI to PI)
export function angleDifference(target, current) {
    let diff = target - current;
    // Normalize to -PI to PI range
    while (diff > PI) diff -= TWO_PI;
    while (diff < -PI) diff += TWO_PI;
    return diff;
}
