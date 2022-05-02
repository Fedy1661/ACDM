// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IDAO.sol";

contract Staking {
    using SafeERC20 for IERC20;
    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardToken;

    uint256 public freezeTime;
    uint256 public percent;

    IDAO public owner;

    struct User {
        uint256 amount;
        uint256 timestamp;
        uint256 stackedAt;
        uint256 accumulated;
    }

    mapping(address => User) private _users;

    modifier onlyOwner {
        require(msg.sender == address(owner), 'Only owner');
        _;
    }

    event Stake(address indexed owner, uint256 amount);
    event Unstake(address indexed owner, uint256 amount);
    event Claim(address indexed owner, uint256 amount);

    constructor(address _stakingToken, address _rewardsToken, uint _freezeTime, uint256 _percent){
        owner = IDAO(msg.sender);
        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardsToken);
        freezeTime = _freezeTime;
        percent = _percent;
    }

    function stake(uint256 _amount) public {
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);

        User storage sender = _users[msg.sender];
        uint256 senderAmount = sender.amount;

        uint256 rewardQuantity = (block.timestamp - sender.timestamp) / 604800;

        sender.accumulated = (senderAmount * percent / 100) * rewardQuantity;
        sender.timestamp = block.timestamp;
        sender.stackedAt = block.timestamp;
        sender.amount = senderAmount + _amount;

        emit Stake(msg.sender, _amount);
    }

    function claim() public {
        User storage sender = _users[msg.sender];
        uint256 senderTimestamp = sender.timestamp;

        uint256 rewardQuantity = (block.timestamp - senderTimestamp) / 604800;
        uint256 rewardAmount = (sender.amount * percent / 100) * rewardQuantity + sender.accumulated;

        rewardToken.safeTransfer(msg.sender, rewardAmount);

        delete sender.accumulated;
        sender.timestamp = senderTimestamp + rewardQuantity * 600;

        emit Claim(msg.sender, rewardAmount);
    }

    function unstake() public {
        User storage sender = _users[msg.sender];
        uint256 senderAmount = sender.amount;

        require(block.timestamp >= owner.canClaimAt(msg.sender), "You are in active voting");
        require(block.timestamp - sender.stackedAt >= freezeTime, 'Freezing time has not passed');

        stakingToken.safeTransfer(msg.sender, senderAmount);

        uint256 rewardQuantity = (block.timestamp - sender.timestamp) / 604800;
        uint256 rewardAmount = (senderAmount * percent / 100) * rewardQuantity;
        sender.accumulated = sender.accumulated + rewardAmount;
        delete sender.amount;

        emit Unstake(msg.sender, senderAmount);
    }

    function balanceOf(address _user) public view returns(uint256) {
        return _users[_user].amount;
    }

    function setFreezeTime(uint256 _freezeTime) public onlyOwner {
        freezeTime = _freezeTime;
    }

    function setPercent(uint256 _percent) public onlyOwner {
        require(_percent < 101, "Incorrect percent");
        percent = _percent;
    }

    function transferOwnership(address _newOwner) public onlyOwner {
        owner = IDAO(_newOwner);
    }
}
