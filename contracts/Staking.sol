// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./DAO.sol";

contract Staking {
    using SafeERC20 for IERC20;
    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardToken;

    uint256 public freezeTime; /// Time after which you can get the stake back
    uint256 public percent; /// Percentage that is accrued.

    DAO public owner;

    struct User {
        uint256 amount; /// Amount staked tokens
        uint256 claimAt; /// Took the reward at this time
        uint256 stackedAt; /// Stake tokens at this time
        uint256 accumulated; /// Savings amount
    }

    mapping(address => User) private _users; /// address => user information

    /**
    * @dev Make sure that msg.sender is the owner
    */
    modifier onlyOwner {
        require(msg.sender == address(owner), 'Only owner');
        _;
    }

    event Stake(address indexed owner, uint256 amount);
    event Unstake(address indexed owner, uint256 amount);
    event Claim(address indexed owner, uint256 amount);

    /**
    * @param _stakingToken Staking token address
    * @param _rewardsToken Rewards token address
    * @param _freezeTime Time after which you can get the stake back
    * @param _percent Percentage that is accrued
    */
    constructor(address _stakingToken, address _rewardsToken, uint _freezeTime, uint256 _percent){
        owner = DAO(msg.sender);
        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardsToken);
        freezeTime = _freezeTime;
        percent = _percent;
    }

    /**
    * @dev Stake tokens
    * @param _amount Amount of stakingTokens
    */
    function stake(uint256 _amount) public {
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);

        User storage sender = _users[msg.sender];
        uint256 senderAmount = sender.amount;

        uint256 rewardQuantity = (block.timestamp - sender.claimAt) / 604800;

        sender.accumulated = (senderAmount * percent / 100) * rewardQuantity;
        sender.claimAt = block.timestamp;
        sender.stackedAt = block.timestamp;
        sender.amount = senderAmount + _amount;

        emit Stake(msg.sender, _amount);
    }

    /**
    * @dev Claim rewards
    */
    function claim() public {
        User storage sender = _users[msg.sender];
        uint256 senderTimestamp = sender.claimAt;

        uint256 rewardQuantity = (block.timestamp - senderTimestamp) / 604800;
        uint256 rewardAmount = (sender.amount * percent / 100) * rewardQuantity + sender.accumulated;

        rewardToken.safeTransfer(msg.sender, rewardAmount);

        delete sender.accumulated;
        sender.claimAt = senderTimestamp + rewardQuantity * 604800;

        emit Claim(msg.sender, rewardAmount);
    }

    /**
    * @dev Get staked tokens back
    */
    function unstake() public {
        User storage sender = _users[msg.sender];
        uint256 senderAmount = sender.amount;

        require(block.timestamp >= owner.canClaimAt(msg.sender), "You are in active voting");
        require(block.timestamp - sender.stackedAt >= freezeTime, 'Freezing time has not passed');

        stakingToken.safeTransfer(msg.sender, senderAmount);

        uint256 rewardQuantity = (block.timestamp - sender.claimAt) / 604800;
        uint256 rewardAmount = (senderAmount * percent / 100) * rewardQuantity;
        sender.accumulated = sender.accumulated + rewardAmount;
        delete sender.amount;

        emit Unstake(msg.sender, senderAmount);
    }

    /**
    * @dev Get user balance with staked tokens
    * @param _user User address
    */
    function balanceOf(address _user) public view returns(uint256) {
        return _users[_user].amount;
    }

    /**
    * @dev Set new freezeTime
    * @param _freezeTime Time after which you can get the stake back
    */
    function setFreezeTime(uint256 _freezeTime) public onlyOwner {
        freezeTime = _freezeTime;
    }

    /**
    * @dev Set new percent
    * @param _percent The accrued percentage of the staked tokens
    */
    function setPercent(uint256 _percent) public onlyOwner {
        require(_percent < 101, "Incorrect percent");
        percent = _percent;
    }

    /**
    * @dev Transfer of the owner's rights
    * @param _newOwner New owner
    */
    function transferOwnership(address _newOwner) public onlyOwner {
        owner = DAO(_newOwner);
    }
}
