// Kinematic Chain class for flexible spine systems
// Used for crocodile body animation with inverse kinematics

import { Vector } from './Vector.js';

const PI = Math.PI;
const TWO_PI = Math.PI * 2;

// Helper function to normalize angle to [0, 2π)
function simplifyAngle(angle) {
    while (angle >= TWO_PI) angle -= TWO_PI;
    while (angle < 0) angle += TWO_PI;
    return angle;
}

// Helper function to calculate relative angle difference
function relativeAngleDiff(angle, anchor) {
    angle = simplifyAngle(angle + PI - anchor);
    anchor = PI;
    return anchor - angle;
}

// Constrain angle within a certain range of anchor angle
function constrainAngle(angle, anchor, constraint) {
    if (Math.abs(relativeAngleDiff(angle, anchor)) <= constraint) {
        return simplifyAngle(angle);
    }
    if (relativeAngleDiff(angle, anchor) > constraint) {
        return simplifyAngle(anchor - constraint);
    }
    return simplifyAngle(anchor + constraint);
}

export class Chain {
    constructor(origin, jointCount, linkSize, angleConstraint = TWO_PI, trailAngle = 0) {
        this.linkSize = linkSize;
        this.angleConstraint = angleConstraint;
        this.joints = [];
        this.angles = [];
        
        // Initialize first joint at origin
        this.joints.push(origin.copy());
        this.angles.push(simplifyAngle(trailAngle + PI));

        // Initialize remaining joints in a line
        let offset = Vector.fromAngle(trailAngle).mult(this.linkSize);
        for (let i = 1; i < jointCount; i++) {
            this.joints.push(Vector.add(this.joints[i - 1], offset));
            this.angles.push(simplifyAngle(trailAngle + PI));
        }
    }

    /**
     * Resolve the kinematic chain using inverse kinematics
     * @param {Vector} pos - The target position for the first joint (head)
     */
    resolve(pos) {
        // Set first joint to target position
        this.joints[0] = pos.copy();
        
        // Resolve each subsequent joint
        for (let i = 1; i < this.joints.length; i++) {
            // Calculate direction from current joint to previous joint
            let diff = Vector.sub(this.joints[i - 1], this.joints[i]);
            let curAngle = diff.heading();
            
            // RIGID SKULL LOGIC (Constraint Phase)
            // Indices 1, 2, 3 correspond to the snout and main skull.
            // Instead of blindly overwriting the angle, we gently constrain it 
            // to match the head angle, but we MUST respect the link distance.
            if (i <= 3) {
                // Very tight constraint for the skull to keep it rigid but connected
                curAngle = constrainAngle(curAngle, this.angles[0], 0.1);
            } else {
                // Standard angular constraint for the rest of the body
                curAngle = constrainAngle(curAngle, this.angles[i - 1], this.angleConstraint);
            }
            
            this.angles[i] = curAngle;
            
            // Re-calculate position based on the constrained angle and fixed link size
            let offset = Vector.fromAngle(this.angles[i]).setMag(this.linkSize);
            this.joints[i] = Vector.sub(this.joints[i - 1], offset);
        }
    }
}
